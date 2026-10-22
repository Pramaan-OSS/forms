"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ZActionClassInput } from "@forms/types/action-classes";
import { ZId } from "@forms/types/common";
import { OperationNotAllowedError } from "@forms/types/errors";
import { TSurvey, ZSurvey } from "@forms/types/surveys/types";
import { assertCan } from "@/lib/authorization";
import { pramaan } from "@/lib/pramaan";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getOrganizationIdFromSurveyId, getWorkspaceIdFromSurveyId } from "@/lib/utils/helper";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { createActionClass } from "@/modules/survey/editor/lib/action-class";
import { checkExternalUrlsPermission } from "@/modules/survey/editor/lib/check-external-urls-permission";
import { updateSurvey, updateSurveyDraft } from "@/modules/survey/editor/lib/survey";
import { ZSurveyDraft } from "@/modules/survey/editor/types/survey";
import { getSurveyFollowUpsPermission } from "@/modules/survey/follow-ups/lib/utils";
import { assertCanWriteCustomHeadScripts } from "@/modules/survey/lib/custom-head-scripts-permission";
import { checkSpamProtectionPermission } from "@/modules/survey/lib/permission";
import { getSurvey } from "@/modules/survey/lib/survey";
import { getWorkspace, getWorkspaceLanguages } from "./lib/workspace";

const checkSurveyFollowUpsPermission = async (
  organizationId: string,
  newFollowUpIds: string[],
  oldFollowUpIds: Set<string>
): Promise<void> => {
  const isSurveyFollowUpsEnabled = await getSurveyFollowUpsPermission(organizationId);
  if (isSurveyFollowUpsEnabled) return;

  for (const id of newFollowUpIds) {
    if (!oldFollowUpIds.has(id)) {
      throw new OperationNotAllowedError("Survey follow ups are not enabled for this organization");
    }
  }
};

export const updateSurveyDraftAction = authenticatedActionClient
  .inputSchema(ZSurveyDraft)
  .action(async ({ ctx, parsedInput }) => {
    // Cast to TSurvey - ZSurveyDraft validates structure, full validation happens on publish
    const survey = parsedInput as TSurvey;

    const organizationId = await getOrganizationIdFromSurveyId(survey.id);
    const workspaceId = await getWorkspaceIdFromSurveyId(survey.id);
    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: survey.id,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    if (survey.recaptcha?.enabled) {
      await checkSpamProtectionPermission(organizationId);
    }

    const oldObject = await getSurvey(survey.id);

    if (survey.followUps.length) {
      const oldFollowUpIds = new Set((oldObject?.followUps ?? []).map((f) => f.id));
      await checkSurveyFollowUpsPermission(
        organizationId,
        survey.followUps.map((f) => f.id),
        oldFollowUpIds
      );
    }

    await checkExternalUrlsPermission(organizationId, survey, oldObject);
    await assertCanWriteCustomHeadScripts({ type: "user", id: ctx.user.id }, workspaceId, survey, oldObject);

    // Use the draft version that skips validation. This is also the autosave's path, so custom CSS it
    // processes is charged to the user like a manual save.
    const result = await updateSurveyDraft(survey, { customCssPrincipal: ctx.user.id });

    revalidatePath(`/workspaces/${result.workspaceId}/surveys/${result.id}`);

    return result;
  });

export const updateSurveyAction = authenticatedActionClient
  .inputSchema(ZSurvey)
  .action(async ({ ctx, parsedInput }) => {
    const organizationId = await getOrganizationIdFromSurveyId(parsedInput.id);
    const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.id);
    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: parsedInput.id,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    if (parsedInput.recaptcha?.enabled) {
      await checkSpamProtectionPermission(organizationId);
    }

    const oldObject = await getSurvey(parsedInput.id);

    if (parsedInput.followUps?.length) {
      const oldFollowUpIds = new Set((oldObject?.followUps ?? []).map((f) => f.id));
      await checkSurveyFollowUpsPermission(
        organizationId,
        parsedInput.followUps.map((f) => f.id),
        oldFollowUpIds
      );
    }

    // Check external URLs permission (with grandfathering)
    await checkExternalUrlsPermission(organizationId, parsedInput, oldObject);
    await assertCanWriteCustomHeadScripts(
      { type: "user", id: ctx.user.id },
      workspaceId,
      parsedInput,
      oldObject
    );
    const result = await updateSurvey(parsedInput, { customCssPrincipal: ctx.user.id });

    revalidatePath(`/workspaces/${result.workspaceId}/surveys/${result.id}`);

    return result;
  });

const ZRefetchWorkspaceAction = z.object({
  workspaceId: z.cuid2(),
});

export const refetchWorkspaceAction = authenticatedActionClient
  .inputSchema(ZRefetchWorkspaceAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });

    return await getWorkspace(parsedInput.workspaceId);
  });

const ZGetWorkspaceLanguagesAction = z.object({
  workspaceId: ZId,
});

export const getWorkspaceLanguagesAction = authenticatedActionClient
  .inputSchema(ZGetWorkspaceLanguagesAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.read", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });

    return await getWorkspaceLanguages(parsedInput.workspaceId);
  });

const ZSearchStockImagesAction = z.object({
  searchQuery: z.string(),
  page: z.number().optional(),
});

export const searchStockImagesAction = authenticatedActionClient
  .inputSchema(ZSearchStockImagesAction)
  .action(async ({ parsedInput, ctx }) => {
    await applyRateLimit(rateLimitConfigs.actions.imageSearch, ctx.user.id);
    if (!pramaan) throw new Error("This feature is not available yet.");
    try {
      const result = (await pramaan.call("image.search", { query: parsedInput.searchQuery, limit: 9 })) as {
        results: { imageUrl: string; pageUrl: string; title?: string }[];
      };
      return result.results.map((image, index) => ({
        id: String(index),
        alt_description: image.title ?? "",
        urls: { regularWithAttribution: image.imageUrl },
      }));
    } catch {
      throw new Error("Image search is not available yet.");
    }
  });

const ZCreateActionClassAction = z.object({
  action: ZActionClassInput,
});

export const createActionClassAction = authenticatedActionClient
  .inputSchema(ZCreateActionClassAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = parsedInput.action.workspaceId;
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    const result = await createActionClass(workspaceId, parsedInput.action);

    return result;
  });
