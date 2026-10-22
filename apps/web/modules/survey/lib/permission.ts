import { OperationNotAllowedError } from "@forms/types/errors";
import { hasOrganizationEntitlement } from "@/modules/entitlements/lib/checks";
import { FEATURE_KEYS } from "@/modules/entitlements/lib/feature-keys";

/**
 * Checks if the organization has spam protection enabled.
 *
 * Spam protection was a removed paid surface; without it there is nothing to
 * enable, so the check always refuses.
 * @param {string} organizationId - The ID of the organization to check.
 * @returns {Promise<void>} A promise that resolves if spam protection is enabled.
 * @throws {OperationNotAllowedError} If spam protection is not enabled for the organization.
 */
export const checkSpamProtectionPermission = async (organizationId: string): Promise<void> => {
  const isSpamProtectionEnabled = await hasOrganizationEntitlement(
    organizationId,
    FEATURE_KEYS.SPAM_PROTECTION
  );
  if (!isSpamProtectionEnabled) {
    throw new OperationNotAllowedError("Spam protection is not enabled for this organization");
  }
};

export const getExternalUrlsPermission = async (organizationId: string): Promise<boolean> =>
  (await hasOrganizationEntitlement(organizationId, FEATURE_KEYS.CUSTOM_REDIRECT_URL)) &&
  (await hasOrganizationEntitlement(organizationId, FEATURE_KEYS.CUSTOM_LINKS_IN_SURVEYS));
