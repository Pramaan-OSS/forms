"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ResourceNotFoundError } from "@forms/types/errors";
import { assertCan } from "@/lib/authorization";
import { deleteResponse, getResponse, getResponseWithQuotas } from "@/lib/response/service";
import { createTag, getTagsByWorkspaceId } from "@/lib/tag/service";
import { addTagToRespone, deleteTagOnResponse } from "@/lib/tagOnResponse/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getWorkspaceIdFromResponseId, getWorkspaceIdFromSurveyId } from "@/lib/utils/helper";
import { getTag } from "@/lib/utils/services";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";

const ZCreateTagAction = z.object({
  workspaceId: ZId,
  tagName: z.string(),
});

export const createTagAction = authenticatedActionClient
  .inputSchema(ZCreateTagAction)
  .action(async ({ parsedInput, ctx }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, parsedInput.workspaceId);
    const result = await createTag(parsedInput.workspaceId, parsedInput.tagName);

    if (result.ok) {
    } else {
    }

    return result;
  });

const ZCreateTagToResponseAction = z.object({
  responseId: ZId,
  tagId: ZId,
});

export const createTagToResponseAction = authenticatedActionClient
  .inputSchema(ZCreateTagToResponseAction)
  .action(async ({ parsedInput, ctx }) => {
    const response = await getResponse(parsedInput.responseId);
    const tag = await getTag(parsedInput.tagId);

    if (!response || !tag) {
      throw new ResourceNotFoundError("Workspace", null);
    }

    const responseWorkspaceId = await getWorkspaceIdFromSurveyId(response.surveyId);

    if (responseWorkspaceId !== tag.workspaceId) {
      throw new Error("Response and tag are not in the same workspace");
    }

    await assertCan({ type: "user", id: ctx.user.id }, "response.write", {
      type: "response",
      id: parsedInput.responseId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, responseWorkspaceId);
    const result = await addTagToRespone(parsedInput.responseId, parsedInput.tagId);
    revalidatePath(`/workspaces/${responseWorkspaceId}/surveys/${response.surveyId}`);
    return result;
  });

const ZDeleteTagOnResponseAction = z.object({
  responseId: ZId,
  tagId: ZId,
});

export const deleteTagOnResponseAction = authenticatedActionClient
  .inputSchema(ZDeleteTagOnResponseAction)
  .action(async ({ parsedInput, ctx }) => {
    const response = await getResponse(parsedInput.responseId);
    const tag = await getTag(parsedInput.tagId);
    if (!response || !tag) {
      throw new ResourceNotFoundError("Workspace", null);
    }

    const responseWorkspaceId = await getWorkspaceIdFromSurveyId(response.surveyId);

    if (responseWorkspaceId !== tag.workspaceId) {
      throw new Error("Response and tag are not in the same workspace");
    }

    await assertCan({ type: "user", id: ctx.user.id }, "response.write", {
      type: "response",
      id: parsedInput.responseId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, responseWorkspaceId);
    const result = await deleteTagOnResponse(parsedInput.responseId, parsedInput.tagId);
    revalidatePath(`/workspaces/${responseWorkspaceId}/surveys/${response.surveyId}`);
    return result;
  });

const ZDeleteResponseAction = z.object({
  responseId: ZId,
});

export const deleteResponseAction = authenticatedActionClient
  .inputSchema(ZDeleteResponseAction)
  .action(async ({ parsedInput, ctx }) => {
    const workspaceId = await getWorkspaceIdFromResponseId(parsedInput.responseId);
    await assertCan({ type: "user", id: ctx.user.id }, "response.write", {
      type: "response",
      id: parsedInput.responseId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);
    const result = await deleteResponse(parsedInput.responseId);
    revalidatePath(
      `/workspaces/${await getWorkspaceIdFromSurveyId(result.surveyId)}/surveys/${result.surveyId}`
    );
    return result;
  });

const ZGetTagsByWorkspaceIdAction = z.object({
  workspaceId: ZId,
});

export const getTagsByWorkspaceIdAction = authenticatedActionClient
  .inputSchema(ZGetTagsByWorkspaceIdAction)
  .action(async ({ parsedInput, ctx }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.read", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });

    return await getTagsByWorkspaceId(parsedInput.workspaceId);
  });

const ZGetResponseAction = z.object({
  responseId: ZId,
});

export const getResponseAction = authenticatedActionClient
  .inputSchema(ZGetResponseAction)
  .action(async ({ parsedInput, ctx }) => {
    // An unknown response resolves to no scope, which is a denial: the same `AuthorizationError` a
    // foreign one gets, so a response id's existence is not probeable.
    await assertCan({ type: "user", id: ctx.user.id }, "response.read", {
      type: "response",
      id: parsedInput.responseId,
    });

    return await getResponseWithQuotas(parsedInput.responseId);
  });
