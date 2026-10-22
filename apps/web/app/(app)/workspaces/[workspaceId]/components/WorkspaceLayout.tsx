import { redirect } from "next/navigation";
import { ResourceNotFoundError } from "@forms/types/errors";
import { MainNavigation } from "@/app/(app)/workspaces/[workspaceId]/components/MainNavigation";
import { TopControlBar } from "@/app/(app)/workspaces/[workspaceId]/components/TopControlBar";
import { getTranslate } from "@/i18n/server";
import { IS_DEVELOPMENT } from "@/lib/constants";
import { getBillingFallbackPath } from "@/lib/membership/navigation";
import { getAccessFlags } from "@/lib/membership/utils";
import { TWorkspaceLayoutData } from "@/modules/workspaces/types/workspace-auth";

interface WorkspaceLayoutProps {
  layoutData: TWorkspaceLayoutData;
  children?: React.ReactNode;
}

export const WorkspaceLayout = async ({ layoutData, children }: WorkspaceLayoutProps) => {
  const t = await getTranslate();

  const { user, organization, membership, workspace } = layoutData;

  const { isMember, isOwner, isManager, isBilling } = getAccessFlags(membership.role);
  const isOwnerOrManager = isOwner || isManager;

  if (isBilling) return redirect(getBillingFallbackPath(organization.id));

  // Validate that the caller is a member of the organization.
  if (!isMember && !isOwnerOrManager) {
    throw new ResourceNotFoundError(t("common.workspace"), null);
  }

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden">
      <div className="flex h-full">
        <MainNavigation
          organization={organization}
          user={user}
          workspace={{ id: workspace.id, name: workspace.name }}
          isDevelopment={IS_DEVELOPMENT}
          membershipRole={membership.role}
          isAccessControlAllowed={false}
        />
        <div id="mainContent" className="flex flex-1 flex-col overflow-hidden bg-slate-50">
          <TopControlBar
            currentOrganizationId={organization.id}
            isMultiOrgEnabled
            isOwnerOrManager={isOwnerOrManager}
            isAccessControlAllowed={false}
            membershipRole={membership.role}
          />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
};
