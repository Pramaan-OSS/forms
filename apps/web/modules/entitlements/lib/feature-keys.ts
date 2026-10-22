/**
 * Entitlement feature keys. The removed paid-features layer gated these on
 * subscriptions and licence keys; the template keeps only the plan-free
 * answer. Keys for removed features stay so existing call sites keep
 * compiling — they can never turn on.
 */
export const FEATURE_KEYS = {
  CUSTOM_REDIRECT_URL: "custom-redirect-url",
  CUSTOM_LINKS_IN_SURVEYS: "custom-links-in-surveys",
  FOLLOW_UPS: "follow-ups",
  HIDE_BRANDING: "hide-branding",
  QUOTA_MANAGEMENT: "quota-management",
  RBAC: "rbac",
  SPAM_PROTECTION: "spam-protection",
  CONTACTS: "contacts",
  AI_SMART_TOOLS: "ai-smart-tools",
  FEEDBACK_DIRECTORIES: "feedback-directories",
  DASHBOARDS: "dashboards",
  WORKFLOWS: "workflows",
  BULK_INVITE: "bulk-invite",
  CUSTOM_CSS: "custom-css",
} as const;

/** Features every workspace has: the plan-free product. */
export const INCLUDED_FEATURES: readonly TEntitlementFeature[] = [
  FEATURE_KEYS.CUSTOM_REDIRECT_URL,
  FEATURE_KEYS.CUSTOM_LINKS_IN_SURVEYS,
  FEATURE_KEYS.FOLLOW_UPS,
  FEATURE_KEYS.HIDE_BRANDING,
  FEATURE_KEYS.BULK_INVITE,
  FEATURE_KEYS.CUSTOM_CSS,
];

export type TKnownEntitlementFeature = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];
export type TUsageLimitEntitlementFeature = `responses-${number}`;
export type TEntitlementFeature = TKnownEntitlementFeature | TUsageLimitEntitlementFeature;

export const isEntitlementFeature = (feature: string): feature is TEntitlementFeature => {
  if ((Object.values(FEATURE_KEYS) as readonly string[]).includes(feature)) {
    return true;
  }

  return /^responses-\d+$/.test(feature);
};
