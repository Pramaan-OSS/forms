import type { TEntitlementFeature } from "./feature-keys";

export type TEntitlementSource = "included";

export type TEntitlementLimits = {
  workspaces: number | null;
  monthlyResponses: number | null;
  monthlyWorkflowRuns: number | null;
};

export type TOrganizationEntitlementsContext = {
  organizationId: string;
  source: TEntitlementSource;
  features: readonly TEntitlementFeature[];
  limits: TEntitlementLimits;
};
