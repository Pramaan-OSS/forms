import { NextRequest } from "next/server";
import { z } from "zod";
import { can } from "@/lib/authorization";
import { getWorkspaceAuthorizationActionForMethod } from "@/lib/authorization/permission-action";
import { findNewlyAttachedNotWorkspaceVisibleSurveyIds } from "@/lib/survey/visibility/outbound";
import { authenticatedApiClient } from "@/modules/api/v2/auth/authenticated-api-client";
import { responses } from "@/modules/api/v2/lib/response";
import { handleApiError } from "@/modules/api/v2/lib/utils";
import { getWorkspaceIdFromSurveyIds } from "@/modules/api/v2/management/lib/helper";
import { surveyNotWorkspaceVisibleError } from "@/modules/api/v2/management/lib/survey-visibility";
import {
  deleteWebhook,
  getWebhook,
  updateWebhook,
} from "@/modules/api/v2/management/webhooks/[webhookId]/lib/webhook";
import {
  ZWebhookIdSchema,
  ZWebhookUpdateSchema,
} from "@/modules/api/v2/management/webhooks/[webhookId]/types/webhooks";
import { ApiErrorResponseV2 } from "@/modules/api/v2/types/api-error";

export const GET = async (request: NextRequest, props: { params: Promise<{ webhookId: string }> }) =>
  authenticatedApiClient({
    request,
    schemas: {
      params: z.object({ webhookId: ZWebhookIdSchema }),
    },
    externalParams: props.params,
    handler: async ({ authentication, parsedInput }) => {
      const { params } = parsedInput;

      if (!params) {
        return handleApiError(request, {
          type: "bad_request",
          details: [{ field: "params", issue: "missing" }],
        });
      }

      const webhook = await getWebhook(params.webhookId);

      if (!webhook.ok) {
        return handleApiError(request, webhook.error as ApiErrorResponseV2);
      }

      if (
        !(await can(
          { type: "apiKey", id: authentication.apiKeyId },
          getWorkspaceAuthorizationActionForMethod("GET"),
          { type: "workspace", id: webhook.data.workspaceId }
        ))
      ) {
        return handleApiError(request, {
          type: "unauthorized",
          details: [{ field: "webhook", issue: "unauthorized" }],
        });
      }

      return responses.successResponse(webhook);
    },
  });

export const PUT = async (request: NextRequest, props: { params: Promise<{ webhookId: string }> }) =>
  authenticatedApiClient({
    request,
    schemas: {
      params: z.object({ webhookId: ZWebhookIdSchema }),
      body: ZWebhookUpdateSchema,
    },
    externalParams: props.params,
    handler: async ({ authentication, parsedInput }) => {
      const { params, body } = parsedInput;

      if (!body || !params) {
        return handleApiError(request, {
          type: "bad_request",
          details: [{ field: !body ? "body" : "params", issue: "missing" }],
        });
      }

      const surveysWorkspaceIdResult = await getWorkspaceIdFromSurveyIds(body.surveyIds);

      if (!surveysWorkspaceIdResult.ok) {
        return handleApiError(request, surveysWorkspaceIdResult.error);
      }

      const surveysWorkspaceId = surveysWorkspaceIdResult.data;

      // get webhook workspace
      const webhook = await getWebhook(params.webhookId);

      if (!webhook.ok) {
        return handleApiError(request, webhook.error as ApiErrorResponseV2);
      }

      if (
        !(await can(
          { type: "apiKey", id: authentication.apiKeyId },
          getWorkspaceAuthorizationActionForMethod("PUT"),
          { type: "workspace", id: webhook.data.workspaceId }
        ))
      ) {
        return handleApiError(request, {
          type: "unauthorized",
          details: [{ field: "webhook", issue: "unauthorized" }],
        });
      }

      // check if webhook workspace matches the surveys workspace
      if (surveysWorkspaceId && webhook.data.workspaceId !== surveysWorkspaceId) {
        return handleApiError(request, {
          type: "bad_request",
          details: [{ field: "surveyIds", issue: "webhook workspace does not match the surveys workspace" }],
        });
      }

      const blockedSurveyIds = await findNewlyAttachedNotWorkspaceVisibleSurveyIds(
        body.surveyIds,
        webhook.data.surveyIds
      );
      if (blockedSurveyIds.length > 0) {
        return handleApiError(request, surveyNotWorkspaceVisibleError(blockedSurveyIds));
      }

      const updatedWebhook = await updateWebhook(params.webhookId, body);

      if (!updatedWebhook.ok) {
        return handleApiError(request, updatedWebhook.error as ApiErrorResponseV2); // NOSONAR // We need to assert or we get a type error
      }

      return responses.successResponse(updatedWebhook);
    },
  });

export const DELETE = async (request: NextRequest, props: { params: Promise<{ webhookId: string }> }) =>
  authenticatedApiClient({
    request,
    schemas: {
      params: z.object({ webhookId: ZWebhookIdSchema }),
    },
    externalParams: props.params,
    handler: async ({ authentication, parsedInput }) => {
      const { params } = parsedInput;

      if (!params) {
        return handleApiError(request, {
          type: "bad_request",
          details: [{ field: "params", issue: "missing" }],
        });
      }

      const webhook = await getWebhook(params.webhookId);

      if (!webhook.ok) {
        return handleApiError(request, webhook.error as ApiErrorResponseV2);
      }

      if (
        !(await can(
          { type: "apiKey", id: authentication.apiKeyId },
          getWorkspaceAuthorizationActionForMethod("DELETE"),
          { type: "workspace", id: webhook.data.workspaceId }
        ))
      ) {
        return handleApiError(request, {
          type: "unauthorized",
          details: [{ field: "webhook", issue: "unauthorized" }],
        });
      }

      const deletedWebhook = await deleteWebhook(params.webhookId);

      if (!deletedWebhook.ok) {
        return handleApiError(request, deletedWebhook.error as ApiErrorResponseV2); // NOSONAR // We need to assert or we get a type error
      }

      return responses.successResponse(deletedWebhook);
    },
  });
