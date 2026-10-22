import { hasOrganizationEntitlement } from "@/modules/entitlements/lib/checks";
import { FEATURE_KEYS } from "@/modules/entitlements/lib/feature-keys";

export const getSurveyFollowUpsPermission = async (organizationId: string): Promise<boolean> =>
  hasOrganizationEntitlement(organizationId, FEATURE_KEYS.FOLLOW_UPS);
