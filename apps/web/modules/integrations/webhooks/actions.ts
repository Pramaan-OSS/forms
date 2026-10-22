"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ResourceNotFoundError } from "@forms/types/errors";
import { assertCan } from "@/lib/authorization";
import { generateWebhookSecret } from "@/lib/crypto";
import { assertNewlyAttachedSurveysWorkspaceVisible } from "@/lib/survey/visibility/outbound";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getWorkspaceIdFromWebhookId } from "@/lib/utils/helper";
import {
  getWebhook,
  getWebhookWithSecret,
} from "@/modules/api/v2/management/webhooks/[webhookId]/lib/webhook";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import {
  createWebhook,
  deleteWebhook,
  testEndpoint,
  updateWebhook,
} from "@/modules/integrations/webhooks/lib/webhook";
import { ZWebhookInput } from "@/modules/integrations/webhooks/types/webhooks";

const ZCreateWebhookAction = z.object({
  workspaceId: ZId,
  webhookInput: ZWebhookInput,
  webhookSecret: z.string().optional(),
});

export const createWebhookAction = authenticatedActionClient
  .inputSchema(ZCreateWebhookAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, parsedInput.workspaceId);
    await assertNewlyAttachedSurveysWorkspaceVisible(parsedInput.webhookInput.surveyIds ?? []);
    const webhook = await createWebhook(
      parsedInput.workspaceId,
      parsedInput.webhookInput,
      parsedInput.webhookSecret
    );

    return webhook;
  });

const ZDeleteWebhookAction = z.object({
  id: ZId,
});

export const deleteWebhookAction = authenticatedActionClient
  .inputSchema(ZDeleteWebhookAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromWebhookId(parsedInput.id);
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    const result = await deleteWebhook(parsedInput.id);
    return result;
  });

const ZUpdateWebhookAction = z.object({
  webhookId: ZId,
  webhookInput: ZWebhookInput,
});

export const updateWebhookAction = authenticatedActionClient
  .inputSchema(ZUpdateWebhookAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromWebhookId(parsedInput.webhookId);
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    const existing = await getWebhook(parsedInput.webhookId);
    await assertNewlyAttachedSurveysWorkspaceVisible(
      parsedInput.webhookInput.surveyIds ?? [],
      existing.ok ? existing.data.surveyIds : []
    );

    const result = await updateWebhook(parsedInput.webhookId, parsedInput.webhookInput);
    return result;
  });

const ZTestEndpointAction = z.object({
  url: z.string(),
  webhookId: ZId.optional(),
  // Required so the not-yet-created-webhook path has something to authorize against; without it this
  // action did no authorization at all and any logged-in user — including a billing-only member with no
  // product access — could make the server POST a signed test payload to any URL they named.
  workspaceId: ZId,
  secret: z.string().optional(),
});

export const testEndpointAction = authenticatedActionClient
  .inputSchema(ZTestEndpointAction)
  .action(async ({ ctx, parsedInput }) => {
    let secret: string | undefined;

    if (parsedInput.webhookId) {
      await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
        type: "workspace",
        id: await getWorkspaceIdFromWebhookId(parsedInput.webhookId),
      });

      const webhookResult = await getWebhookWithSecret(parsedInput.webhookId);
      if (!webhookResult.ok) {
        throw new ResourceNotFoundError("Webhook", parsedInput.webhookId);
      }

      secret = webhookResult.data.secret ?? undefined;
    } else {
      // No webhook yet: authorize against the workspace the webhook is being created in.
      await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
        type: "workspace",
        id: parsedInput.workspaceId,
      });

      // New webhook, use the provided secret or generate a new one
      secret = parsedInput.secret ?? generateWebhookSecret();
    }

    await testEndpoint(parsedInput.url, secret);
    return { success: true, secret };
  });
