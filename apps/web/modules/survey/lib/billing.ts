import "server-only";
import { DEFAULT_ORGANIZATION_BILLING, type TOrganizationBilling } from "@forms/types/organizations";

/**
 * The organization's billing data. There is no subscription or billing row behind this any more —
 * paid tiers are removed and every organization carries the same default limits.
 */
export const getOrganizationBillingRecord = (): TOrganizationBilling => DEFAULT_ORGANIZATION_BILLING;
