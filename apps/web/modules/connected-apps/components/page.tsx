import { redirect } from "next/navigation";
import { getSurveys } from "@/app/(app)/workspaces/[workspaceId]/settings/workspace/integrations/lib/surveys";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";
import { type OfferedApp, listAppConnections, searchConnectedAppActions } from "../lib/connected-apps";
import { AppMapping } from "./app-mapping";

export async function ConnectedAppPage({
  workspaceId,
  app,
}: Readonly<{ workspaceId: string; app: OfferedApp }>) {
  const { workspace, organization, session, canManage } = await getWorkspaceAuth(workspaceId);
  if (!canManage) redirect(`/workspaces/${workspace.id}/settings/workspace/integrations`);
  const [surveys, connections, actions] = await Promise.all([
    getSurveys(workspace.id, session.user.id, organization.id),
    listAppConnections(session.user.id, app).catch(() => []),
    searchConnectedAppActions("create", app).catch(() => []),
  ]);
  return (
    <AppMapping
      workspaceId={workspace.id}
      app={app}
      catalogApp={actions[0]?.app}
      connected={connections.some((item) => item.status === "active")}
      surveys={surveys.map((item) => ({ id: item.id, name: item.name }))}
    />
  );
}
