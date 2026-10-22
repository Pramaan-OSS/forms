"use client";

import { TOrganizationRole } from "@forms/types/memberships";
import { WorkspaceAndOrgSwitch } from "@/app/(app)/workspaces/[workspaceId]/components/workspace-and-org-switch";
import { useWorkspaceContext } from "@/app/(app)/workspaces/[workspaceId]/context/workspace-context";

interface TopControlBarProps {
  currentOrganizationId: string;
  isMultiOrgEnabled: boolean;
  isOwnerOrManager: boolean;
  isAccessControlAllowed: boolean;
  membershipRole?: TOrganizationRole;
  // False on the workspace-agnostic settings routes, where no workspace is in scope.
  showWorkspaceBreadcrumb?: boolean;
}

export const TopControlBar = ({
  currentOrganizationId,
  isMultiOrgEnabled,
  isOwnerOrManager,
  isAccessControlAllowed,
  membershipRole,
  showWorkspaceBreadcrumb = true,
}: Readonly<TopControlBarProps>) => {
  const { workspace } = useWorkspaceContext();
  const isMembershipPending = membershipRole === undefined;

  return (
    <div
      className="flex h-14 w-full items-center justify-between bg-slate-50 px-6"
      data-testid="fb__global-top-control-bar">
      <WorkspaceAndOrgSwitch
        currentWorkspaceId={workspace.id}
        currentOrganizationId={currentOrganizationId}
        isMultiOrgEnabled={isMultiOrgEnabled}
        isOwnerOrManager={isOwnerOrManager}
        isMembershipPending={isMembershipPending}
        isAccessControlAllowed={isAccessControlAllowed}
        showWorkspaceBreadcrumb={showWorkspaceBreadcrumb}
      />
    </div>
  );
};
