"use server";

import { z } from "zod";
import { ZSurveySlug } from "@forms/types/surveys/types";
import { assertCan } from "@/lib/authorization";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getWorkspaceIdFromSurveyId } from "@/lib/utils/helper";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { updateSurveySlug } from "@/modules/survey/lib/slug";

const ZUpdateSurveySlugAction = z.object({
  surveyId: z.cuid2(),
  slug: ZSurveySlug,
});

export const updateSurveySlugAction = authenticatedActionClient
  .inputSchema(ZUpdateSurveySlugAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);
    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: parsedInput.surveyId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    return await updateSurveySlug(parsedInput.surveyId, parsedInput.slug);
  });

const ZRemoveSurveySlugAction = z.object({
  surveyId: z.cuid2(),
});

export const removeSurveySlugAction = authenticatedActionClient
  .inputSchema(ZRemoveSurveySlugAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);
    await assertCan({ type: "user", id: ctx.user.id }, "survey.write", {
      type: "survey",
      id: parsedInput.surveyId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    return await updateSurveySlug(parsedInput.surveyId, null);
  });
