"use server";

import { z } from "zod";
import { ZActionClassInput } from "@forms/types/action-classes";
import { ZId } from "@forms/types/common";
import { ResourceNotFoundError } from "@forms/types/errors";
import { deleteActionClass, getActionClass, updateActionClass } from "@/lib/actionClass/service";
import { assertCan } from "@/lib/authorization";
import { getSurveysByActionClassId } from "@/lib/survey/service";
import { getUserVisibleSurveyWhere } from "@/lib/survey/visibility/actor-context";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getOrganizationIdFromActionClassId, getWorkspaceIdFromActionClassId } from "@/lib/utils/helper";

const ZDeleteActionClassAction = z.object({
  actionClassId: ZId,
});

export const deleteActionClassAction = authenticatedActionClient
  .inputSchema(ZDeleteActionClassAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: await getWorkspaceIdFromActionClassId(parsedInput.actionClassId),
    });
    return await deleteActionClass(parsedInput.actionClassId);
  });

const ZUpdateActionClassAction = z.object({
  actionClassId: ZId,
  updatedAction: ZActionClassInput,
});

export const updateActionClassAction = authenticatedActionClient
  .inputSchema(ZUpdateActionClassAction)
  .action(async ({ ctx, parsedInput }) => {
    const actionClass = await getActionClass(parsedInput.actionClassId);
    if (actionClass === null) {
      throw new ResourceNotFoundError("ActionClass", parsedInput.actionClassId);
    }

    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: await getWorkspaceIdFromActionClassId(parsedInput.actionClassId),
    });
    const result = await updateActionClass(
      actionClass.workspaceId,
      parsedInput.actionClassId,
      parsedInput.updatedAction
    );
    return result;
  });

const ZGetActiveInactiveSurveysAction = z.object({
  actionClassId: ZId,
  excludeSurveyId: ZId.optional(),
});

export const getActiveInactiveSurveysAction = authenticatedActionClient
  .inputSchema(ZGetActiveInactiveSurveysAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromActionClassId(parsedInput.actionClassId);
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.read", {
      type: "workspace",
      id: workspaceId,
    });

    const surveys = await getSurveysByActionClassId(
      parsedInput.actionClassId,
      workspaceId,
      await getUserVisibleSurveyWhere(
        ctx.user.id,
        await getOrganizationIdFromActionClassId(parsedInput.actionClassId)
      )
    );
    const filteredSurveys = parsedInput.excludeSurveyId
      ? surveys.filter((survey) => survey.id !== parsedInput.excludeSurveyId)
      : surveys;
    const response = {
      activeSurveys: filteredSurveys
        .filter((survey) => survey.status === "inProgress")
        .map((survey) => survey.name),
      inactiveSurveys: filteredSurveys
        .filter((survey) => survey.status !== "inProgress")
        .map((survey) => survey.name),
    };
    return response;
  });
