import "server-only";
import { isEntitlementFeature } from "./feature-keys";
import { getOrganizationEntitlementsContext } from "./provider";

export const hasOrganizationEntitlement = async (
  organizationId: string,
  featureLookupKey: string
): Promise<boolean> => {
  const context = await getOrganizationEntitlementsContext(organizationId);

  if (!isEntitlementFeature(featureLookupKey)) {
    return false;
  }

  return context.features.includes(featureLookupKey);
};

/**
 * Kept for call-site compatibility with the removed licence-guarded check:
 * without a licence layer the answer is the same as the plain entitlement.
 */
export const hasOrganizationEntitlementWithLicenseGuard = hasOrganizationEntitlement;
