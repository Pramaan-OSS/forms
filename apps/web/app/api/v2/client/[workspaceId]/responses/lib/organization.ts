import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { logger } from "@forms/logger";
import { DEFAULT_ORGANIZATION_BILLING, type TOrganizationBilling } from "@forms/types/organizations";

/**
 * The billing data for the workspace's organization. Paid tiers are removed, so this is the same
 * default for every organization; the lookup only confirms the workspace still exists.
 */
export const getOrganizationBillingByWorkspaceId = reactCache(
  async (workspaceId: string): Promise<TOrganizationBilling | null> => {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      });

      if (!workspace) {
        return null;
      }

      return DEFAULT_ORGANIZATION_BILLING;
    } catch (error) {
      logger.error(error, "Failed to get organization billing by workspace ID");
      return null;
    }
  }
);
