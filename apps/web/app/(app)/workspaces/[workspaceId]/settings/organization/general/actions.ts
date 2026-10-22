"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { OperationNotAllowedError, ResourceNotFoundError } from "@forms/types/errors";
import { ZOrganizationUpdateInput } from "@forms/types/organizations";
import { getTranslate } from "@/i18n/server";
import { isInstanceAIConfigured } from "@/lib/ai/service";
import { type TAuthorizationAction, assertCan } from "@/lib/authorization";
import { deleteOrganization, getOrganization, updateOrganization } from "@/lib/organization/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { AuthenticatedActionClientCtx } from "@/lib/utils/action-client/types/context";
import {
  ZOrganizationAISettingsInput,
  ZUpdateOrganizationAISettingsAction,
  ZUpdateOrganizationDisplayTimeZoneAction,
} from "./schemas";

async function updateOrganizationAction<T extends z.ZodRawShape>({
  ctx,
  organizationId,
  data,
  action,
}: {
  ctx: AuthenticatedActionClientCtx;
  organizationId: string;
  data: z.infer<z.ZodObject<T>>;
  action: Extract<TAuthorizationAction, "organization.write" | "organization.manage">;
}) {
  await assertCan({ type: "user", id: ctx.user.id }, action, { type: "organization", id: organizationId });
  return await updateOrganization(organizationId, data);
}

const ZUpdateOrganizationNameAction = z.object({
  organizationId: ZId,
  data: ZOrganizationUpdateInput.pick({ name: true }),
});

export const updateOrganizationNameAction = authenticatedActionClient
  .inputSchema(ZUpdateOrganizationNameAction)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: AuthenticatedActionClientCtx;
      parsedInput: z.infer<typeof ZUpdateOrganizationNameAction>;
    }) =>
      updateOrganizationAction({
        ctx,
        organizationId: parsedInput.organizationId,
        data: parsedInput.data,
        action: "organization.write",
      })
  );

type TOrganizationAISettings = Pick<
  NonNullable<Awaited<ReturnType<typeof getOrganization>>>,
  "isAISmartToolsEnabled"
>;

type TResolvedOrganizationAISettings = {
  smartToolsEnabled: boolean;
  isEnablingAnyAISetting: boolean;
};

const resolveOrganizationAISettings = ({
  data,
  organization,
}: {
  data: z.infer<typeof ZOrganizationAISettingsInput>;
  organization: TOrganizationAISettings;
}): TResolvedOrganizationAISettings => {
  const smartToolsEnabled = Object.hasOwn(data, "isAISmartToolsEnabled")
    ? (data.isAISmartToolsEnabled ?? organization.isAISmartToolsEnabled)
    : organization.isAISmartToolsEnabled;

  return {
    smartToolsEnabled,
    isEnablingAnyAISetting: smartToolsEnabled && !organization.isAISmartToolsEnabled,
  };
};

const assertOrganizationAISettingsUpdateAllowed = ({
  isInstanceAIConfigured,
  resolvedSettings,
  t,
}: {
  isInstanceAIConfigured: boolean;
  resolvedSettings: TResolvedOrganizationAISettings;
  t: Awaited<ReturnType<typeof getTranslate>>;
}) => {
  if (resolvedSettings.isEnablingAnyAISetting && !isInstanceAIConfigured) {
    throw new OperationNotAllowedError(t("workspace.settings.general.ai_instance_not_configured"));
  }
};

export const updateOrganizationAISettingsAction = authenticatedActionClient
  .inputSchema(ZUpdateOrganizationAISettingsAction)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: AuthenticatedActionClientCtx;
      parsedInput: z.infer<typeof ZUpdateOrganizationAISettingsAction>;
    }) => {
      const t = await getTranslate(ctx.user.locale);
      const organization = await getOrganization(parsedInput.organizationId);

      if (!organization) {
        throw new ResourceNotFoundError("Organization", parsedInput.organizationId);
      }

      const resolvedSettings = resolveOrganizationAISettings({
        data: parsedInput.data,
        organization,
      });

      assertOrganizationAISettingsUpdateAllowed({
        isInstanceAIConfigured: isInstanceAIConfigured(),
        resolvedSettings,
        t,
      });

      return updateOrganizationAction({
        ctx,
        organizationId: parsedInput.organizationId,
        data: parsedInput.data,
        action: "organization.manage",
      });
    }
  );

export const updateOrganizationDisplayTimeZoneAction = authenticatedActionClient
  .inputSchema(ZUpdateOrganizationDisplayTimeZoneAction)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: AuthenticatedActionClientCtx;
      parsedInput: z.infer<typeof ZUpdateOrganizationDisplayTimeZoneAction>;
    }) =>
      updateOrganizationAction({
        ctx,
        organizationId: parsedInput.organizationId,
        data: parsedInput.data,
        action: "organization.manage",
      })
  );

const ZDeleteOrganizationAction = z.object({
  organizationId: ZId,
});

export const deleteOrganizationAction = authenticatedActionClient
  .inputSchema(ZDeleteOrganizationAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.write", {
      type: "organization",
      id: parsedInput.organizationId,
    });
    return await deleteOrganization(parsedInput.organizationId);
  });
