"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ResourceNotFoundError } from "@forms/types/errors";
import { ZResponseFilterCriteria } from "@forms/types/responses";
import { assertCan } from "@/lib/authorization";
import { getResponseDownloadFile, getResponseFilteringValues } from "@/lib/response/service";
import { getSurvey } from "@/lib/survey/service";
import { getTagsByWorkspaceId } from "@/lib/tag/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";

const ZGetResponsesDownloadUrlAction = z.object({
  surveyId: ZId,
  format: z.union([z.literal("csv"), z.literal("xlsx")]),
  filterCriteria: ZResponseFilterCriteria,
});

export const getResponsesDownloadUrlAction = authenticatedActionClient
  .inputSchema(ZGetResponsesDownloadUrlAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "survey.response_export", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    const result = await getResponseDownloadFile(
      parsedInput.surveyId,
      parsedInput.format,
      parsedInput.filterCriteria
    );

    return result;
  });

const ZGetSurveyFilterDataAction = z.object({
  surveyId: ZId,
});

export const getSurveyFilterDataAction = authenticatedActionClient
  .inputSchema(ZGetSurveyFilterDataAction)
  .action(async ({ ctx, parsedInput }) => {
    // Authorized first: the resolver denies an unknown id too, so a forbidden survey and a missing one
    // answer alike (ENG-3282) instead of "not found" confirming which ids exist.
    await assertCan({ type: "user", id: ctx.user.id }, "survey.response_read", {
      type: "survey",
      id: parsedInput.surveyId,
    });

    const survey = await getSurvey(parsedInput.surveyId);

    if (!survey) {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }

    const [tags, { contactAttributes: attributes, meta, hiddenFields, reservedValues, variableValues }] =
      await Promise.all([
        getTagsByWorkspaceId(survey.workspaceId),
        getResponseFilteringValues(parsedInput.surveyId),
      ]);

    return { environmentTags: tags, attributes, meta, hiddenFields, reservedValues, variableValues };
  });
