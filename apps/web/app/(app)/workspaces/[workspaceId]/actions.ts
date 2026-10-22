"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ResourceNotFoundError } from "@forms/types/errors";
import { ZWorkspaceUpdateInput } from "@forms/types/workspace";
import { assertCan } from "@/lib/authorization";
import { getOrganization } from "@/lib/organization/service";
import { updateUser } from "@/lib/user/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { createWorkspace } from "@/modules/workspaces/settings/lib/workspace";
import { getOrganizationsByUserId } from "./lib/organization";
import { getWorkspacesByUserId, getWritableWorkspacesByUserId } from "./lib/workspace";

const ZCreateWorkspaceAction = z.object({
  organizationId: ZId,
  data: ZWorkspaceUpdateInput,
});

export const createWorkspaceAction = authenticatedActionClient
  .inputSchema(ZCreateWorkspaceAction)
  .action(async ({ ctx, parsedInput }) => {
    const { user } = ctx;

    const organizationId = parsedInput.organizationId;

    await assertCan({ type: "user", id: user.id }, "organization.manage", {
      type: "organization",
      id: parsedInput.organizationId,
    });

    const organization = await getOrganization(organizationId);

    if (!organization) {
      throw new ResourceNotFoundError("Organization", organizationId);
    }

    const workspace = await createWorkspace(parsedInput.organizationId, parsedInput.data);
    const updatedNotificationSettings = {
      ...user.notificationSettings,
      alert: {
        ...user.notificationSettings?.alert,
      },
    };

    await updateUser(user.id, {
      notificationSettings: updatedNotificationSettings,
    });

    return workspace;
  });

const ZGetOrganizationsForSwitcherAction = z.object({
  organizationId: ZId, // Changed from workspaceId to avoid extra query
});

/**
 * Fetches organizations list for switcher dropdown.
 * Called on-demand when user opens the organization switcher.
 */
export const getOrganizationsForSwitcherAction = authenticatedActionClient
  .inputSchema(ZGetOrganizationsForSwitcherAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.read", {
      type: "organization",
      id: parsedInput.organizationId,
    });

    return await getOrganizationsByUserId(ctx.user.id);
  });

const ZGetWorkspacesForSwitcherAction = z.object({
  organizationId: ZId, // Changed from workspaceId to avoid extra query
});

/**
 * Fetches workspaces list for switcher dropdown.
 * Called on-demand when user opens the workspace switcher.
 */
export const getWorkspacesForSwitcherAction = authenticatedActionClient
  .inputSchema(ZGetWorkspacesForSwitcherAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.read", {
      type: "organization",
      id: parsedInput.organizationId,
    });

    return await getWorkspacesByUserId(ctx.user.id, parsedInput.organizationId);
  });

const ZGetWritableWorkspacesAction = z.object({
  organizationId: ZId,
});

/**
 * Fetches workspaces the user can write to (org owner/manager, or team member with readWrite).
 * Used by flows that target a workspace for a write operation (e.g. copy survey).
 */
export const getWritableWorkspacesAction = authenticatedActionClient
  .inputSchema(ZGetWritableWorkspacesAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.read_access", {
      type: "organization",
      id: parsedInput.organizationId,
    });

    return await getWritableWorkspacesByUserId(ctx.user.id, parsedInput.organizationId);
  });
