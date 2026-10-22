"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { assertCan } from "@/lib/authorization";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import {
  createApiKey,
  deleteApiKey,
  updateApiKey,
} from "@/modules/organization/settings/api-keys/lib/api-key";
import { assertCanGrantOrganizationAccess } from "@/modules/organization/settings/api-keys/lib/organization-access";
import { ZApiKeyCreateInput, ZApiKeyUpdateInput } from "./types/api-keys";

const ZDeleteApiKeyAction = z.object({
  id: ZId,
});

export const deleteApiKeyAction = authenticatedActionClient
  .inputSchema(ZDeleteApiKeyAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "apiKey.manage", {
      type: "apiKey",
      id: parsedInput.id,
    });

    const result = await deleteApiKey(parsedInput.id);
    return result;
  });

const ZCreateApiKeyAction = z.object({
  organizationId: ZId,
  apiKeyData: ZApiKeyCreateInput,
});

export const createApiKeyAction = authenticatedActionClient
  .inputSchema(ZCreateApiKeyAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage_api_keys", {
      type: "organization",
      id: parsedInput.organizationId,
    });

    // Managing API keys and managing organization users are two different capabilities, and a key
    // carrying `accessControl.write` grants the second. Gate it on the org's user-management floor so
    // an install that restricts user management to owners cannot have that restriction minted away.
    await assertCanGrantOrganizationAccess(
      ctx.user.id,
      parsedInput.organizationId,
      parsedInput.apiKeyData.organizationAccess
    );

    const result = await createApiKey(parsedInput.organizationId, ctx.user.id, parsedInput.apiKeyData);
    return result;
  });

const ZUpdateApiKeyAction = z.object({
  apiKeyId: ZId,
  apiKeyData: ZApiKeyUpdateInput,
});

export const updateApiKeyAction = authenticatedActionClient
  .inputSchema(ZUpdateApiKeyAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "apiKey.manage", {
      type: "apiKey",
      id: parsedInput.apiKeyId,
    });

    return await updateApiKey(parsedInput.apiKeyId, parsedInput.apiKeyData);
  });
