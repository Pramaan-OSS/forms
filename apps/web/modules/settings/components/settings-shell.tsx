import { TopControlBar } from "@/app/(app)/workspaces/[workspaceId]/components/TopControlBar";
import { WorkspaceContextWrapper } from "@/app/(app)/workspaces/[workspaceId]/context/workspace-context";
import { SettingsNavigation } from "@/modules/settings/components/settings-navigation";
import type { TSettingsLayoutData } from "@/modules/settings/lib/navigation-data";

interface SettingsShellProps {
  data: TSettingsLayoutData;
  children: React.ReactNode;
}

// Reproduces the workspace shell (banners + sidebar + top bar) used on every settings page, so the
// org-scoped and account-scoped settings routes look identical to the in-workspace settings view —
// only the sidebar comes from SettingsNavigation instead of MainNavigation. The WorkspaceContext is
// supplied from the current workspace so reused settings components (which call useWorkspace) behave
// exactly as they do inside the workspace layout.
export const SettingsShell = ({ data, children }: Readonly<SettingsShellProps>) => {
  const shell = (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden">
      <div className="flex h-full">
        <SettingsNavigation
          user={data.user}
          workspaceId={data.currentWorkspace?.id ?? ""}
          workspaceName={data.currentWorkspace?.name ?? ""}
          organizationId={data.organization.id}
          organizationName={data.organization.name}
          membershipRole={data.membershipRole}
          backUrl={data.backUrl}
        />
        <div id="mainContent" className="flex flex-1 flex-col overflow-hidden bg-slate-50">
          {/* TopControlBar reads the workspace context (and would throw without it), so it only renders
              when there is a current workspace — a user with no workspace still gets the org settings. */}
          {data.currentWorkspace && (
            <TopControlBar
              currentOrganizationId={data.organization.id}
              isMultiOrgEnabled={data.isMultiOrgEnabled}
              isOwnerOrManager={data.isOwnerOrManager}
              isAccessControlAllowed={false}
              membershipRole={data.membershipRole}
              // These routes carry no workspaceId, so the top bar must not claim a current
              // workspace. The sidebar's Workspace section stays as the way to reach one.
              showWorkspaceBreadcrumb={false}
            />
          )}
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );

  // Reused settings components call useWorkspace(); provide the context from the current workspace so
  // they render identically. With no workspace yet, useWorkspace falls back to null on its own.
  if (data.currentWorkspace) {
    return (
      <WorkspaceContextWrapper workspace={data.currentWorkspace} organization={data.organization}>
        {shell}
      </WorkspaceContextWrapper>
    );
  }

  return shell;
};
