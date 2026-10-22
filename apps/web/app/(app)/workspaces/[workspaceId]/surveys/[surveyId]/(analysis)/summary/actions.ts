"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { InvalidInputError, OperationNotAllowedError, ResourceNotFoundError } from "@forms/types/errors";
import { getEmailTemplateHtml } from "@/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib/emailTemplate";
import { generateExampleResponseDataset } from "@/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib/example-responses";
import { persistExampleResponseDataset } from "@/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib/example-responses-persistence";
import { assertOrganizationAIConfigured } from "@/lib/ai/service";
import { assertCan } from "@/lib/authorization";
import { getResponseCountBySurveyId } from "@/lib/response/service";
import { getSurvey, updateSurvey } from "@/lib/survey/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getOrganizationIdFromSurveyId, getWorkspaceIdFromSurveyId } from "@/lib/utils/helper";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { sendEmbedSurveyPreviewEmail } from "@/modules/email";
import { deleteResponsesAndDisplaysForSurvey } from "./lib/survey";

const ZSendEmbedSurveyPreviewEmailAction = z.object({
  surveyId: ZId,
});

export const sendEmbedSurveyPreviewEmailAction = authenticatedActionClient
  .inputSchema(ZSendEmbedSurveyPreviewEmailAction)
  .action(async ({ ctx, parsedInput }) => {
    // Authorized first, so a forbidden survey and a missing one answer alike (ENG-3282).
    await assertCan({ type: "user", id: ctx.user.id }, "survey.read", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    const survey = await getSurvey(parsedInput.surveyId);
    if (!survey) {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }

    const rawEmailHtml = await getEmailTemplateHtml(parsedInput.surveyId, ctx.user.locale);
    const emailHtml = rawEmailHtml
      .replaceAll("?preview=true&amp;", "?")
      .replaceAll("?preview=true&;", "?")
      .replaceAll("?preview=true", "");

    return await sendEmbedSurveyPreviewEmail(ctx.user.email, emailHtml, survey.workspaceId, ctx.user.locale);
  });

const ZResetSurveyAction = z.object({
  surveyId: ZId,
  workspaceId: ZId,
});

export const resetSurveyAction = authenticatedActionClient
  .inputSchema(ZResetSurveyAction)
  .action(async ({ ctx, parsedInput }) => {
    // Reset irreversibly deletes every response and display, so it needs manage access on the survey
    // rather than the write access that edits it. Checked on the survey, not the workspace, so private
    // surveys and pending visibility changes stay fail-closed (ENG-3282).
    await assertCan({ type: "user", id: ctx.user.id }, "survey.manage", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    // Reset is hidden client-side while archived, but re-check server-side so a stale tab or a direct
    // action call can't wipe the responses/displays the 30-day archive window exists to preserve.
    const survey = await getSurvey(parsedInput.surveyId);
    if (!survey) {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }
    if (survey.archivedAt) {
      throw new OperationNotAllowedError("Cannot reset an archived survey.");
    }

    const { deletedResponsesCount, deletedDisplaysCount } = await deleteResponsesAndDisplaysForSurvey(
      parsedInput.surveyId
    );

    return {
      deletedResponsesCount,
      deletedDisplaysCount,
    };
  });

const ZGenerateExampleResponsesAction = z.object({
  surveyId: ZId,
});

// Generates a small set of LLM-authored example responses for a survey that
// has no real responses yet. Server-side gates: caller must have write access,
// the org's AI smart-tools feature must be enabled and entitled, and the
// survey must currently have zero responses (button is also hidden client-side
// when responseCount > 0, but we re-check here so a stale tab can't insert
// noise into a live survey).
export const generateExampleResponsesAction = authenticatedActionClient
  .inputSchema(ZGenerateExampleResponsesAction)
  .action(async ({ ctx, parsedInput }) => {
    // Per-user limit (1 per minute). Closes the multi-click race window where
    // two clicks fired before the first LLM call returns could both pass the
    // responseCount === 0 check, and bounds a single user's overall LLM spend.
    await applyRateLimit(rateLimitConfigs.actions.generateExampleResponses, ctx.user.id);

    const organizationId = await getOrganizationIdFromSurveyId(parsedInput.surveyId);
    const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);

    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    // Set before the gates below so a rejected or failed attempt is still attributed to the right
    // organization and survey — the wrapper audits failures too, which is how a rolled-back batch
    // leaves a trace now that the write is all-or-nothing.

    // Throws OperationNotAllowedError if AI is unentitled, disabled, or
    // the instance isn't configured (env vars). Same gating helper that the
    // existing AI text endpoint uses.
    await assertOrganizationAIConfigured(organizationId);

    const survey = await getSurvey(parsedInput.surveyId);
    if (!survey) {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }

    // Same stale-tab defense as the responseCount check below: generating examples is hidden while
    // archived, but a direct call would still write responses/displays/a tag into an archived survey.
    if (survey.archivedAt) {
      throw new OperationNotAllowedError("Cannot generate example responses for an archived survey.");
    }

    const existingCount = await getResponseCountBySurveyId(parsedInput.surveyId);
    if (existingCount > 0) {
      throw new OperationNotAllowedError(
        "Example responses can only be generated for a survey that has no responses yet."
      );
    }

    const generatedDataset = await generateExampleResponseDataset({
      survey,
      organizationId,
    });
    if (generatedDataset.responses.length === 0) {
      throw new InvalidInputError(
        "This survey doesn't contain any question types we can synthesize answers for yet."
      );
    }

    // Single all-or-nothing write: a failure part-way through the batch leaves no synthetic rows
    // behind, so the survey stays eligible for another attempt instead of tripping the zero-response
    // guard above on a partial batch.
    const result = await persistExampleResponseDataset({
      surveyId: survey.id,
      workspaceId,
      dataset: generatedDataset,
    });

    return result;
  });

const ZGetEmailHtmlAction = z.object({
  surveyId: ZId,
});

export const getEmailHtmlAction = authenticatedActionClient
  .inputSchema(ZGetEmailHtmlAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    return await getEmailTemplateHtml(parsedInput.surveyId, ctx.user.locale);
  });

const ZUpdateSingleUseLinksAction = z.object({
  surveyId: ZId,
  workspaceId: ZId,
  isSingleUse: z.boolean(),
  isSingleUseEncryption: z.boolean(),
});

export const updateSingleUseLinksAction = authenticatedActionClient
  .inputSchema(ZUpdateSingleUseLinksAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    const survey = await getSurvey(parsedInput.surveyId);
    if (!survey) {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }

    const updatedSurvey = await updateSurvey({
      ...survey,
      singleUse: { enabled: parsedInput.isSingleUse, isEncrypted: parsedInput.isSingleUseEncryption },
    });

    return updatedSurvey;
  });
