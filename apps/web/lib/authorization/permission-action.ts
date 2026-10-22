import "server-only";
import { OrganizationAccessType } from "@forms/types/api-key";
import type { TAuthorizationAction } from "./contract";

type TWorkspaceAction = Extract<TAuthorizationAction, `workspace.${string}`>;

/**
 * The workspace permission ladder. The WorkspaceTeam grants that used to feed
 * it were part of the removed paid surface; every organization member gets
 * full access, so callers pass the level their endpoint needs.
 */
export type TTeamPermission = "read" | "readWrite" | "manage";
export type TAuthorizationHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Maps the current WorkspaceTeam permission ladder to the central vocabulary.
 *
 * This is intentionally not exported from the public authorization barrel. It translates persisted
 * source permission enums into the engine-independent authorization vocabulary at service boundaries.
 */
export const getWorkspaceAuthorizationAction = (minPermission?: TTeamPermission): TWorkspaceAction => {
  if (minPermission === "manage") return "workspace.manage";
  if (minPermission === "readWrite") return "workspace.write";
  return "workspace.read";
};

export const getWorkspaceAuthorizationActionForMethod = (
  method: TAuthorizationHttpMethod
): TWorkspaceAction => {
  if (method === "DELETE") return "workspace.manage";
  if (method === "GET") return "workspace.read";
  return "workspace.write";
};

export const getOrganizationAuthorizationActionForAccessType = (
  accessType: OrganizationAccessType
): Extract<TAuthorizationAction, `organization.${string}`> =>
  accessType === OrganizationAccessType.Write ? "organization.manage_access" : "organization.read_access";
