import { z } from "zod";
import type { Session } from "@forms/types/auth";
import { TMembership, ZMembership } from "@forms/types/memberships";
import { TOrganization, ZOrganization } from "@forms/types/organizations";
import { TUser, ZUser } from "@forms/types/user";
import { TWorkspace, ZWorkspace } from "@forms/types/workspace";

export const ZWorkspaceAuth = z.object({
  workspace: ZWorkspace,
  organization: ZOrganization,
  session: z.object({
    user: ZUser.pick({ id: true }),
    expires: z.string(),
  }),
  currentUserMembership: ZMembership,
  isMember: z.boolean(),
  isOwner: z.boolean(),
  isManager: z.boolean(),
  isBilling: z.boolean(),
  hasReadAccess: z.boolean(),
  hasReadWriteAccess: z.boolean(),
  hasManageAccess: z.boolean(),
  isReadOnly: z.boolean(),
  canManage: z.boolean(),
});

export type TWorkspaceAuth = z.infer<typeof ZWorkspaceAuth>;

/**
 * Complete layout data type for workspace pages.
 * Includes all data needed for layout rendering.
 *
 * Note: organizations and workspaces lists are NOT included - they are lazy-loaded
 * in switcher dropdowns only when needed.
 */
export type TWorkspaceLayoutData = {
  session: Session;
  user: TUser;
  workspace: TWorkspace; // Current workspace with full details
  organization: TOrganization;
  membership: TMembership;
};
