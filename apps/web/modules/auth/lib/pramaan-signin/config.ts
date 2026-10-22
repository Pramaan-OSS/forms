import "server-only";

/**
 * Social and enterprise sign-in run on the platform's auth capabilities
 * (`auth.social.exchange`, `auth.enterprise.start`). Both are optional and off
 * until configured: social needs the sign-in providers named with their OAuth
 * application ids, enterprise needs at least one saved connection.
 */

export const SOCIAL_SIGN_IN_COOKIE = "pramaan_signin";

const SOCIAL_PROVIDER_KEYS = ["google", "microsoft", "github"] as const;

export type SocialProviderKey = (typeof SOCIAL_PROVIDER_KEYS)[number];

export const isSocialProviderKey = (value: string): value is SocialProviderKey =>
  (SOCIAL_PROVIDER_KEYS as readonly string[]).includes(value);

/** The providers' authorization endpoints. The code never leaves this table. */
const AUTHORIZATION_ENDPOINTS: Record<SocialProviderKey, string> = {
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  github: "https://github.com/login/oauth/authorize",
};

export interface SocialSignInProvider {
  readonly key: SocialProviderKey;
  readonly clientId: string;
}

/**
 * The configured social providers, from one variable:
 * `PRAMAAN_SOCIAL_SIGN_IN=google:<oauth-app-id>,github:<oauth-app-id>`.
 * Empty or unset means social sign-in is off.
 */
export const parseSocialSignInConfig = (value: string | undefined): SocialSignInProvider[] => {
  if (!value?.trim()) return [];
  const providers: SocialSignInProvider[] = [];
  for (const entry of value.split(",")) {
    const [rawKey, clientId] = entry.trim().split(":");
    if (!rawKey || !clientId?.trim()) continue;
    if (!isSocialProviderKey(rawKey)) continue;
    providers.push({ key: rawKey, clientId: clientId.trim() });
  }
  return providers;
};

/** The provider's authorization address with this app's redirect and one-time values. */
export const socialAuthorizationUrl = (
  provider: SocialSignInProvider,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string => {
  const endpoint = AUTHORIZATION_ENDPOINTS[provider.key];
  const url = new URL(endpoint);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (provider.key === "github") {
    url.searchParams.set("scope", "read:user user:email");
  } else {
    url.searchParams.set("scope", "openid email profile");
  }
  return url.toString();
};
