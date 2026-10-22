import { redirect } from "next/navigation";
import { getBillingFallbackPath } from "@/lib/membership/navigation";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const redirectBillingRoleFromRestrictedSettings = async (workspaceId: string): Promise<void> => {
  const { isBilling, organization } = await getWorkspaceAuth(workspaceId);

  if (isBilling) {
    redirect(getBillingFallbackPath(organization.id));
  }
};
