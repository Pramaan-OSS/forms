import { AuthenticationError } from "@forms/types/errors";
import { TWorkspace } from "@forms/types/workspace";
import { getTranslate } from "@/i18n/server";
import { getUserWorkspaces } from "@/lib/workspace/service";
import { getSession } from "@/modules/auth/lib/session";
import { DeleteWorkspaceRender } from "@/modules/workspaces/settings/general/components/delete-workspace-render";

interface DeleteWorkspaceProps {
  organizationId: string;
  currentWorkspace: TWorkspace;
  isOwnerOrManager: boolean;
}

// Where the browser goes after a successful deletion is resolved by the delete action itself, so it
// reflects the workspaces and survey counts at navigation time rather than at page-render time.
export const DeleteWorkspace = async ({
  organizationId,
  currentWorkspace,
  isOwnerOrManager,
}: Readonly<DeleteWorkspaceProps>) => {
  const t = await getTranslate();
  const session = await getSession();
  if (!session) {
    throw new AuthenticationError(t("common.session_not_found"));
  }
  const availableWorkspaces = await getUserWorkspaces(session.user.id, organizationId);

  const availableWorkspacesLength = availableWorkspaces ? availableWorkspaces.length : 0;
  const isDeleteDisabled = availableWorkspacesLength <= 1 || !isOwnerOrManager;

  return (
    <DeleteWorkspaceRender
      isDeleteDisabled={isDeleteDisabled}
      isOwnerOrManager={isOwnerOrManager}
      currentWorkspace={currentWorkspace}
    />
  );
};
