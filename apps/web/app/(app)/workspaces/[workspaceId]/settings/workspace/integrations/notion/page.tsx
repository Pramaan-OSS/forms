import { ConnectedAppPage } from "@/modules/connected-apps/components/page";

export default async function Page(props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  return <ConnectedAppPage workspaceId={workspaceId} app="notion" />;
}
