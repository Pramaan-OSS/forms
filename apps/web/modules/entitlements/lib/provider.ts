import "server-only";
import { cache as reactCache } from "react";
import { INCLUDED_FEATURES } from "./feature-keys";
import type { TOrganizationEntitlementsContext } from "./types";

/**
 * The one entitlements answer: every workspace has the plan-free product.
 * There is no licence check and no subscription behind this any more.
 */
export const getOrganizationEntitlementsContext = reactCache(
  async (organizationId: string): Promise<TOrganizationEntitlementsContext> => ({
    organizationId,
    source: "included",
    features: INCLUDED_FEATURES,
    limits: {
      workspaces: null,
      monthlyResponses: null,
      monthlyWorkflowRuns: null,
    },
  })
);
