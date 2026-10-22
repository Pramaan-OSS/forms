import { redirect } from "next/navigation";
import { getBillingFallbackPath } from "@/lib/membership/navigation";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const WorkspaceSettingsLayout = async (props: {
  params: Promise<{ workspaceId: string }>;
  children: React.ReactNode;
}) => {
  const params = await props.params;
  const { children } = props;

  try {
    const { isBilling, organization } = await getWorkspaceAuth(params.workspaceId);

    if (isBilling) {
      return redirect(getBillingFallbackPath(organization.id));
    }

    return children;
  } catch (error) {
    // The error boundary will catch this
    throw error;
  }
};
