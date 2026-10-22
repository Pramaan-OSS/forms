"use server";

import { z } from "zod";
import { TUserNotificationSettings } from "@forms/types/user";
import { createMembership } from "@/lib/membership/service";
import { createOrganization } from "@/lib/organization/service";
import { updateUser } from "@/lib/user/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { DEFAULT_WORKSPACE_NAME } from "@/lib/workspace/constants";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { createWorkspace } from "@/modules/workspaces/settings/lib/workspace";

const ZCreateOrganizationAction = z.object({
  organizationName: z.string().min(1, "Organization name must be at least 1 character long"),
});

export const createOrganizationAction = authenticatedActionClient
  .inputSchema(ZCreateOrganizationAction)
  .action(async ({ ctx, parsedInput }) => {
    await applyRateLimit(rateLimitConfigs.actions.createOrganization, ctx.user.id);

    const newOrganization = await createOrganization({
      name: parsedInput.organizationName,
    });

    await createMembership(newOrganization.id, ctx.user.id, {
      role: "owner",
      accepted: true,
    });
    await createWorkspace(newOrganization.id, {
      name: DEFAULT_WORKSPACE_NAME,
    });

    const updatedNotificationSettings: TUserNotificationSettings = {
      ...ctx.user.notificationSettings,
      alert: {
        ...ctx.user.notificationSettings?.alert,
      },

      unsubscribedOrganizationIds: Array.from(
        new Set([...(ctx.user.notificationSettings?.unsubscribedOrganizationIds || []), newOrganization.id]) // NOSONAR // We want to check for empty strings too
      ),
    };

    await updateUser(ctx.user.id, {
      notificationSettings: updatedNotificationSettings,
    });

    return newOrganization;
  });
