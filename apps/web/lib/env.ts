import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { logger } from "@forms/logger";
import { isValidIanaTimeZone } from "@forms/types/common";
import { throwEnvValidationError } from "./env-validation-error";

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isValidMcpOauthJwksUrl = (value: string): boolean => {
  if (!isHttpUrl(value)) {
    return false;
  }

  const url = new URL(value);
  return url.hostname.length > 0 && url.username === "" && url.password === "" && url.hash === "";
};

const ZMcpOauthJwksUrl = z.url().refine(isValidMcpOauthJwksUrl, {
  message: "MCP_OAUTH_JWKS_URL must be a valid http(s) URL without credentials or a fragment",
});

/**
 * An exact redirect URI an operator lets anonymous MCP client registration claim (ENG-3471). On top of
 * the JWKS URL rules (a host, no credentials): https only, because a registered callback is where
 * authorization codes are delivered; no fragment at all, not even an empty `#` (RFC 6749 §3.1.2); no
 * `*`, so nobody configures a wildcard expecting it to match — the allowlist compares exact strings;
 * and not a loopback host, because Better Auth refuses loopback redirects for the `web` clients these
 * register as, so such an entry could never be used.
 */
const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  hostname === "[::1]" ||
  hostname.startsWith("127.");

const isValidDcrRedirectUri = (value: string): boolean => {
  if (!isValidMcpOauthJwksUrl(value) || value.includes("#") || value.includes("*")) return false;
  const url = new URL(value);
  return url.protocol === "https:" && !isLoopbackHostname(url.hostname);
};

const ZDcrRedirectUri = z.url().refine(isValidDcrRedirectUri, {
  message:
    "MCP_DCR_ALLOWED_REDIRECT_URIS entries must be exact, non-loopback https URLs without credentials, a fragment or a wildcard",
});

/** Comma-separated list; blank, and empty entries from a stray comma, count as unset. */
const ZDcrRedirectUriList = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}, z.array(ZDcrRedirectUri).optional());

type TEnvironmentIssuePath = keyof TAuthzedConfigurationEnv | keyof TAuthConfigurationEnv;

const addEnvIssue = (ctx: z.RefinementCtx, path: TEnvironmentIssuePath, message: string): void => {
  ctx.addIssue({
    code: "custom",
    path: [path],
    message,
  });
};

const ZSurveySchedulingTimeZone = z.string().trim().min(1).refine(isValidIanaTimeZone, {
  message: "SURVEY_SCHEDULING_TIME_ZONE must be a valid IANA time zone",
});

const ZSurveySchedulingLocalHour = z.coerce.number().int().min(0).max(23);
const ZSurveySchedulingLocalMinute = z.coerce.number().int().min(0).max(59);
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
/**
 * Blank normalizes to unset, but a non-blank value is kept VERBATIM — no `.trim()`, which in zod is a
 * transform and would rewrite the parsed value. For a secret that is fatal: an instance whose value
 * carries a trailing newline (what `kubectl create secret --from-file` stores, and what the chart
 * faithfully round-trips through `b64dec`) has been signing with the untrimmed string, so trimming it
 * here would invalidate every session and every outstanding invite and verification link.
 */
const ZOptionalVerbatimSecret = z.preprocess(emptyStringToUndefined, z.string().min(1).optional());
const ZAuthzedBoolean = z.enum(["true", "false", "1", "0"]);
const ZAuthzedConsistency = z.enum(["minimize_latency", "fully_consistent"]).optional();
const ZAuthzedToken = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "AUTHZED_TOKEN must not be empty",
  })
  .optional();

const isValidAuthzedEndpoint = (value: string): boolean => {
  if (/\s/.test(value) || value.includes("/") || /[@?#]/.test(value)) {
    return false;
  }

  const portMatch = value.startsWith("[") ? /^\[[^\]]+\]:(\d+)$/.exec(value) : /^[^:]+:(\d+)$/.exec(value);

  if (!portMatch) {
    return false;
  }

  const port = Number(portMatch[1]);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }

  try {
    const endpoint = new URL(`http://${value}`);

    return (
      endpoint.hostname.length > 0 &&
      endpoint.username === "" &&
      endpoint.password === "" &&
      endpoint.pathname === "/" &&
      endpoint.search === "" &&
      endpoint.hash === ""
    );
  } catch {
    return false;
  }
};

const ZAuthzedEndpoint = z
  .string()
  .refine(isValidAuthzedEndpoint, {
    message: "AUTHZED_ENDPOINT must be a valid host:port without a URL scheme or path",
  })
  .optional();
const ZAuthzedSystemKey = z
  .string()
  .regex(/^(?=.{3,64}$)[a-z_](?:[a-z0-9_]*[a-z0-9])$/, {
    message: "AUTHZED_SYSTEM_KEY must be a valid 3-64 character SpiceDB identifier",
  })
  .optional();

const ZAuthzedConfigurationEnv = z.object({
  AUTHZED_CONSISTENCY: ZAuthzedConsistency,
  AUTHZED_ENABLED: ZAuthzedBoolean.optional(),
  AUTHZED_ENDPOINT: ZAuthzedEndpoint,
  AUTHZED_INSECURE: ZAuthzedBoolean.optional(),
  AUTHZED_SYSTEM_KEY: ZAuthzedSystemKey,
  AUTHZED_TOKEN: ZAuthzedToken,
});

type TAuthzedConfigurationEnv = z.infer<typeof ZAuthzedConfigurationEnv>;

const validateAuthzedConfiguration = (values: TAuthzedConfigurationEnv, ctx: z.RefinementCtx): void => {
  const isEnabled = values.AUTHZED_ENABLED === "true" || values.AUTHZED_ENABLED === "1";

  if (!isEnabled) {
    return;
  }

  if (!values.AUTHZED_ENDPOINT) {
    addEnvIssue(ctx, "AUTHZED_ENDPOINT", "AUTHZED_ENDPOINT is required when AuthZed is enabled");
  }

  if (!values.AUTHZED_TOKEN) {
    addEnvIssue(ctx, "AUTHZED_TOKEN", "AUTHZED_TOKEN is required when AuthZed is enabled");
  }

  if (!values.AUTHZED_SYSTEM_KEY) {
    addEnvIssue(ctx, "AUTHZED_SYSTEM_KEY", "AUTHZED_SYSTEM_KEY is required when AuthZed is enabled");
  }
};

/**
 * The auth secret pair, validated at server start rather than at import.
 *
 * Kept out of the module-eval `superRefine` chain on purpose, for the same reason
 * `assertAuthzedRuntimeConfiguration` is: `next build`, the AuthZed CLI and the typegen script all
 * import this module with no secrets in scope, and a hard requirement there would fail the build
 * rather than the misconfigured boot.
 */
const ZAuthConfigurationEnv = z.object({
  BETTER_AUTH_SECRET: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
});

type TAuthConfigurationEnv = z.infer<typeof ZAuthConfigurationEnv>;

/** Truthiness, not `!== undefined`: a blank secret must count as missing here too. */
const hasValue = (value: string | undefined): value is string => Boolean(value?.trim());

/** The floor Better Auth itself only warns about, and the one this file used to enforce via `.min(32)`. */
const MIN_AUTH_SECRET_LENGTH = 32;

const validateAuthConfiguration = (values: TAuthConfigurationEnv, ctx: z.RefinementCtx): void => {
  const betterAuthSecret = values.BETTER_AUTH_SECRET;
  const legacySecret = values.NEXTAUTH_SECRET;

  if (!hasValue(betterAuthSecret) && !hasValue(legacySecret)) {
    addEnvIssue(
      ctx,
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_SECRET is required. Generate one with `openssl rand -hex 32`. " +
        "(An instance that predates the rename may set NEXTAUTH_SECRET instead; either is accepted. " +
        "AUTH_SECRET is not: Better Auth reads it, but Forms signs its own tokens and does not.)"
    );
    return;
  }

  // The length floor, kept where it still buys something and dropped only where it would trap someone.
  //
  // It applies when BETTER_AUTH_SECRET is the ONLY secret set — a fresh install, which has no migration
  // constraint and would otherwise lose a guard it used to have: Better Auth's own sub-32 check is a
  // `logger.warn` that scrolls past, and those characters become the HMAC key for session cookies and
  // for every invite, verification, email-change and survey-PIN token.
  //
  // It does NOT apply when NEXTAUTH_SECRET is also set. That is the rename-in-progress shape this
  // ticket exists to support: an operator copying a shorter legacy secret onto the new name must not be
  // forced to change its value, because changing it signs everyone out and voids outstanding links.
  // A legacy-only instance is likewise left alone — it boots today with no floor at all.
  if (
    hasValue(betterAuthSecret) &&
    !hasValue(legacySecret) &&
    betterAuthSecret.length < MIN_AUTH_SECRET_LENGTH
  ) {
    addEnvIssue(
      ctx,
      "BETTER_AUTH_SECRET",
      `BETTER_AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters. ` +
        "Generate one with `openssl rand -hex 32`. (Renaming a shorter secret from an older instance? " +
        "Keep NEXTAUTH_SECRET set alongside it and the existing value is accepted as-is.)"
    );
  }
};

const parsedEnv = createEnv({
  onValidationError: throwEnvValidationError,
  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    CRON_SECRET: z.string().optional(),
    DATABASE_URL: z.url(),
    DANGEROUSLY_ALLOW_WEBHOOK_INTERNAL_URLS: z.enum(["1", "0"]).optional(),
    // Bounded so a misconfiguration cannot pin a background-worker slot for minutes.
    WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).optional(),
    DEBUG_SHOW_RESET_LINK: z.enum(["1", "0"]).optional(),
    // DEBUG is a common ambient env var in CI/tooling, so we accept arbitrary strings here
    // and only treat "1" as enabling Forms-specific debug behavior downstream.
    DEBUG: z.string().optional(),
    // cuid2 rather than a bare string so a typo'd or foreign id (a uuid, an uppercase value) fails
    // at boot instead of silently provisioning SSO users into no organization at all. Permissive
    // enough for the cuid v1 ids that `Organization.id @default(cuid())` has always produced.
    AUTH_DEFAULT_ORGANIZATION_ID: z.cuid2().optional(),
    AUTH_DEFAULT_ORGANIZATION_ROLE: z.enum(["owner", "manager", "member", "billing"]).optional(),
    AUTH_DEFAULT_TEAM_ID: z.string().optional(),
    AUTH_SKIP_INVITE_FOR_SSO: z.enum(["1", "0"]).optional(),
    AUTHZED_CONSISTENCY: ZAuthzedConsistency,
    AUTHZED_ENABLED: ZAuthzedBoolean.optional(),
    AUTHZED_ENDPOINT: ZAuthzedEndpoint,
    AUTHZED_INSECURE: ZAuthzedBoolean.optional(),
    AUTHZED_SYSTEM_KEY: ZAuthzedSystemKey,
    AUTHZED_TOKEN: ZAuthzedToken,
    // Cloud-only: when "1", the personal-email sign-up block also applies to invited users.
    // Default (unset/"0") exempts invites — see isSignupEmailDomainBlocked.
    SIGNUP_DOMAIN_CHECK_ON_INVITES: z.enum(["1", "0"]).optional(),
    /**
     * Grace window for single-use links minted before the ENG-2758 fix, which carry no `suToken`.
     *
     * An ISO 8601 date (`YYYY-MM-DD`); unsigned **encrypted** links are accepted until 00:00 UTC on
     * it, and rejected from then on. Unset means no grace at all, which is the secure default.
     *
     * While it is set the deployment accepts a single-use credential that is bound to no survey, so
     * a link issued for one survey opens any other on the same instance. On a multi-tenant
     * deployment that is cross-organisation. Set it only on a single-tenant instance, only long
     * enough to re-issue the outstanding links, and never without an explicit security decision.
     */
    SINGLE_USE_LEGACY_UNSIGNED_UNTIL: z.iso.date().optional(),
    BULLMQ_WORKER_CONCURRENCY: z.coerce.number().int().min(1).optional(),
    BULLMQ_WORKER_COUNT: z.coerce.number().int().min(1).optional(),
    BULLMQ_EXTERNAL_WORKER_ENABLED: z.enum(["1", "0"]).optional(),
    BULLMQ_WORKER_ENABLED: z.enum(["1", "0"]).optional(),
    E2E_TESTING: z.enum(["1", "0"]).optional(),
    EMAIL_AUTH_DISABLED: z.enum(["1", "0"]).optional(),
    EMAIL_VERIFICATION_DISABLED: z.enum(["1", "0"]).optional(),
    ENCRYPTION_KEY: z.string(),
    ENVIRONMENT: z.enum(["production", "staging"]).prefault("production"),
    HTTP_PROXY: z.url().optional(),
    HTTPS_PROXY: z.url().optional(),
    IMPRINT_URL: z
      .url()
      .optional()
      .or(z.string().refine((str) => str === "")),
    IMPRINT_ADDRESS: z.string().optional(),
    INVITE_DISABLED: z.enum(["1", "0"]).optional(),
    INVITE_RATE_LIMIT_PER_24_HOURS: z.coerce.number().int().min(1).optional().default(50),
    // Forms-in-Forms: dogfood in-app surveys. Points at the Forms
    // instance that hosts the surveys (defaults to Forms Cloud). When
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
    FORMS_MANAGED_AUTH_URL: z.string().optional(),
    FORMS_MANAGED_JWKS_URL: z.string().optional(),
    PRAMAAN_API_KEY: z.string().optional(),
    PRAMAAN_FAKE: z.enum(["0", "1"]).optional(),
    PRAMAAN_ENTERPRISE_SIGN_IN: z.enum(["0", "1"]).optional(),
    // Optional social sign-in: `google:<oauth-app-id>,github:<oauth-app-id>`. Off until set.
    PRAMAAN_SOCIAL_SIGN_IN: z.string().optional(),
    PRAMAAN_BOT_CHECK_WIDGET: z.string().optional(),
    PRAMAAN_BASE_URL: z.url().optional(),
    MAIL_FROM: z.email().optional(),
    // `NEXTAUTH_*` are the undocumented backward-compatible alias for `BETTER_AUTH_*` (ENG-2599);
    // lib/constants.ts resolves the pair and explains why the alias is permanent.
    //
    // `ZOptionalNonEmptyString`, not `z.string().optional()`: a blank value has to normalize to
    // *unset* so it falls through to the other variable. `.env.example` ships these keys empty, and an
    // empty secret is not "no secret" — it is a falsy one, which Better Auth silently replaces with
    // its own hardcoded default. `assertAuthRuntimeConfiguration` then refuses to start if neither is
    // actually set, so blank fails loudly at boot instead of quietly at the first invite.
    NEXTAUTH_URL: z.url().optional(),
    NEXTAUTH_SECRET: ZOptionalVerbatimSecret,
    // No length floor: Better Auth itself only warns below 32 characters, and a hard failure here
    // would trap an operator renaming a shorter legacy secret — the one fix available to them would be
    // changing its value, which invalidates every session and outstanding token. Warned about at boot
    // instead (`warnOnAuthSecretRisks`).
    BETTER_AUTH_SECRET: ZOptionalVerbatimSecret,
    BETTER_AUTH_URL: z.url().optional(),
    MCP_OAUTH_JWKS_URL: ZMcpOauthJwksUrl.optional(),
    MCP_DCR_ALLOWED_REDIRECT_URIS: ZDcrRedirectUriList,
    MAIL_FROM_NAME: z.string().optional(),
    REDIS_URL:
      process.env.NODE_ENV === "test"
        ? z.string().optional()
        : z.url("REDIS_URL is required for caching, rate limiting, and audit logging"),
    PASSWORD_RESET_DISABLED: z.enum(["1", "0"]).optional(),
    PASSWORD_RESET_TOKEN_LIFETIME_MINUTES: z.coerce.number().int().min(5).max(120).optional().default(30),
    PRIVACY_URL: z
      .url()
      .optional()
      .or(z.string().refine((str) => str === "")),
    RATE_LIMITING_DISABLED: z.enum(["1", "0"]).optional(),
    // Number of reverse proxies in front of the app whose X-Forwarded-For entries can be believed.
    // Unset falls back to 1 (see TRUSTED_PROXY_HOP_COUNT in lib/constants.ts); an explicit 0 trusts no
    // forwarding header at all. See resolveClientIp in lib/utils/client-ip.ts.
    // Preprocessed because `z.coerce.number()` turns "" into 0, and 0 is a *valid* value here (the
    // explicit "trust nothing" opt-out) rather than something `.min()` would reject. A deployment that
    // renders the variable empty when unset — the common docker-compose / Helm shape — would otherwise
    // silently opt out of trusting any forwarding header, collapsing every request into one rate-limit
    // bucket. The neighbouring numeric vars only fail loudly on "" because their minimums exceed 0.
    TRUSTED_PROXY_HOP_COUNT: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int().min(0).max(10).optional()
    ),
    PUBLIC_URL: z
      .url()
      .refine(
        (url) => {
          try {
            const parsed = new URL(url);
            return parsed.host && parsed.host.length > 0;
          } catch {
            return false;
          }
        },
        {
          error: "PUBLIC_URL must be a valid URL with a proper host (e.g., https://example.com)",
        }
      )
      .optional(),
    TERMS_URL: z
      .url()
      .optional()
      .or(z.string().refine((str) => str === "")),
    RECAPTCHA_SITE_KEY: z.string().optional(),
    WEBAPP_URL: z.url().optional(),

    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    PROMETHEUS_EXPORTER_PORT: z.string().optional(),
    PROMETHEUS_ENABLED: z.enum(["1", "0"]).optional(),
    USER_MANAGEMENT_MINIMUM_ROLE: z.enum(["owner", "manager", "disabled"]).optional(),
    AUDIT_LOG_ENABLED: z.enum(["1", "0"]).optional(),
    AUDIT_LOG_GET_USER_IP: z.enum(["1", "0"]).optional(),
    SESSION_MAX_AGE: z
      .string()
      .transform((val) => Number.parseInt(val, 10))
      .optional(),
    SURVEY_SCHEDULING_TIME_ZONE: ZSurveySchedulingTimeZone.optional().default("Europe/Berlin"),
    SURVEY_SCHEDULING_LOCAL_HOUR: ZSurveySchedulingLocalHour.optional().default(0),
    SURVEY_SCHEDULING_LOCAL_MINUTE: ZSurveySchedulingLocalMinute.optional().default(0),
    // Online upgrade settings.
    MIGRATE_DATABASE_URL: z.string().optional(),
    FORMS_UPGRADE_MODE: z.enum(["online", "maintenance"]).optional(),
    // "1" disables visibility mutations; stored restrictions remain enforced.
    SURVEY_VISIBILITY_FORCE_DISABLED: z.enum(["1", "0"]).optional(),
    // ENG-3282: most surveys one workspace may hold (archived included). Unset means 10,000.
    SURVEY_WORKSPACE_LIMIT: z.coerce.number().int().positive().optional(),
  },
  client: {},

  /*
   * Due to how Next.js bundles environment variables on Edge and Client,
   * we need to manually destructure them to make sure all are included in bundle.
   *
   * 💡 You'll get type errors if not all variables from `server` & `client` are included here.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    MCP_OAUTH_JWKS_URL: process.env.MCP_OAUTH_JWKS_URL,
    MCP_DCR_ALLOWED_REDIRECT_URIS: process.env.MCP_DCR_ALLOWED_REDIRECT_URIS,
    CRON_SECRET: process.env.CRON_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    DANGEROUSLY_ALLOW_WEBHOOK_INTERNAL_URLS: process.env.DANGEROUSLY_ALLOW_WEBHOOK_INTERNAL_URLS,
    WEBHOOK_DELIVERY_TIMEOUT_MS: process.env.WEBHOOK_DELIVERY_TIMEOUT_MS,
    DEBUG: process.env.DEBUG,
    DEBUG_SHOW_RESET_LINK: process.env.DEBUG_SHOW_RESET_LINK,
    AUTH_DEFAULT_ORGANIZATION_ID: process.env.AUTH_SSO_DEFAULT_ORGANIZATION_ID,
    AUTH_DEFAULT_ORGANIZATION_ROLE: process.env.AUTH_SSO_DEFAULT_ORGANIZATION_ROLE,
    AUTH_DEFAULT_TEAM_ID: process.env.AUTH_SSO_DEFAULT_TEAM_ID,
    AUTH_SKIP_INVITE_FOR_SSO: process.env.AUTH_SKIP_INVITE_FOR_SSO,
    AUTHZED_CONSISTENCY: process.env.AUTHZED_CONSISTENCY,
    AUTHZED_ENABLED: process.env.AUTHZED_ENABLED,
    AUTHZED_ENDPOINT: process.env.AUTHZED_ENDPOINT,
    AUTHZED_INSECURE: process.env.AUTHZED_INSECURE,
    AUTHZED_SYSTEM_KEY: process.env.AUTHZED_SYSTEM_KEY,
    AUTHZED_TOKEN: process.env.AUTHZED_TOKEN,
    SIGNUP_DOMAIN_CHECK_ON_INVITES: process.env.SIGNUP_DOMAIN_CHECK_ON_INVITES,
    SINGLE_USE_LEGACY_UNSIGNED_UNTIL: process.env.SINGLE_USE_LEGACY_UNSIGNED_UNTIL,
    BULLMQ_EXTERNAL_WORKER_ENABLED: process.env.BULLMQ_EXTERNAL_WORKER_ENABLED,
    BULLMQ_WORKER_CONCURRENCY: process.env.BULLMQ_WORKER_CONCURRENCY,
    BULLMQ_WORKER_COUNT: process.env.BULLMQ_WORKER_COUNT,
    BULLMQ_WORKER_ENABLED: process.env.BULLMQ_WORKER_ENABLED,
    E2E_TESTING: process.env.E2E_TESTING,
    EMAIL_AUTH_DISABLED: process.env.EMAIL_AUTH_DISABLED,
    EMAIL_VERIFICATION_DISABLED: process.env.EMAIL_VERIFICATION_DISABLED,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ENVIRONMENT: process.env.ENVIRONMENT,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    IMPRINT_URL: process.env.IMPRINT_URL,
    IMPRINT_ADDRESS: process.env.IMPRINT_ADDRESS,
    INVITE_DISABLED: process.env.INVITE_DISABLED,
    INVITE_RATE_LIMIT_PER_24_HOURS: process.env.INVITE_RATE_LIMIT_PER_24_HOURS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    FORMS_MANAGED_AUTH_URL: process.env.FORMS_MANAGED_AUTH_URL,
    FORMS_MANAGED_JWKS_URL: process.env.FORMS_MANAGED_JWKS_URL,
    PRAMAAN_API_KEY: process.env.PRAMAAN_API_KEY,
    PRAMAAN_FAKE: process.env.PRAMAAN_FAKE,
    PRAMAAN_ENTERPRISE_SIGN_IN: process.env.PRAMAAN_ENTERPRISE_SIGN_IN,
    PRAMAAN_SOCIAL_SIGN_IN: process.env.PRAMAAN_SOCIAL_SIGN_IN,
    PRAMAAN_BOT_CHECK_WIDGET: process.env.PRAMAAN_BOT_CHECK_WIDGET,
    PRAMAAN_BASE_URL: process.env.PRAMAAN_BASE_URL,
    MAIL_FROM: process.env.MAIL_FROM,
    MAIL_FROM_NAME: process.env.MAIL_FROM_NAME,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    SURVEY_SCHEDULING_LOCAL_HOUR: process.env.SURVEY_SCHEDULING_LOCAL_HOUR,
    SURVEY_SCHEDULING_LOCAL_MINUTE: process.env.SURVEY_SCHEDULING_LOCAL_MINUTE,
    SURVEY_SCHEDULING_TIME_ZONE: process.env.SURVEY_SCHEDULING_TIME_ZONE,
    MIGRATE_DATABASE_URL: process.env.MIGRATE_DATABASE_URL,
    FORMS_UPGRADE_MODE: process.env.FORMS_UPGRADE_MODE,
    SURVEY_VISIBILITY_FORCE_DISABLED: process.env.SURVEY_VISIBILITY_FORCE_DISABLED,
    SURVEY_WORKSPACE_LIMIT: process.env.SURVEY_WORKSPACE_LIMIT,
    REDIS_URL: process.env.REDIS_URL,
    PASSWORD_RESET_DISABLED: process.env.PASSWORD_RESET_DISABLED,
    PASSWORD_RESET_TOKEN_LIFETIME_MINUTES: process.env.PASSWORD_RESET_TOKEN_LIFETIME_MINUTES,
    PRIVACY_URL: process.env.PRIVACY_URL,
    RATE_LIMITING_DISABLED: process.env.RATE_LIMITING_DISABLED,
    TRUSTED_PROXY_HOP_COUNT: process.env.TRUSTED_PROXY_HOP_COUNT,
    PUBLIC_URL: process.env.PUBLIC_URL,
    RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,
    TERMS_URL: process.env.TERMS_URL,
    WEBAPP_URL: process.env.WEBAPP_URL,
    NODE_ENV: process.env.NODE_ENV,
    PROMETHEUS_ENABLED: process.env.PROMETHEUS_ENABLED,
    PROMETHEUS_EXPORTER_PORT: process.env.PROMETHEUS_EXPORTER_PORT,
    USER_MANAGEMENT_MINIMUM_ROLE: process.env.USER_MANAGEMENT_MINIMUM_ROLE,
    AUDIT_LOG_ENABLED: process.env.AUDIT_LOG_ENABLED,
    AUDIT_LOG_GET_USER_IP: process.env.AUDIT_LOG_GET_USER_IP,
    SESSION_MAX_AGE: process.env.SESSION_MAX_AGE,
  },
});

const ZPostParseEnv = z
  .object({})
  .extend(ZAuthzedConfigurationEnv.shape)
  .superRefine(validateAuthzedConfiguration);
const postParseResult = ZPostParseEnv.safeParse(parsedEnv);

if (!postParseResult.success) {
  throwEnvValidationError(postParseResult.error.issues);
}

export const env = parsedEnv;

/**
 * v6 has no legacy authorization fallback. Validate configuration before serving
 * requests, not during builds or diagnostic CLI imports. This never contacts SpiceDB.
 */
export const assertAuthzedRuntimeConfiguration = (): void => {
  const result = ZAuthzedConfigurationEnv.superRefine((values, ctx) => {
    if (values.AUTHZED_ENABLED !== "true" && values.AUTHZED_ENABLED !== "1") {
      addEnvIssue(
        ctx,
        "AUTHZED_ENABLED",
        "Forms v6 requires AUTHZED_ENABLED=true; configure SpiceDB before starting the server. See /"
      );
    }
    // Report missing credentials even when enablement was omitted.
    validateAuthzedConfiguration({ ...values, AUTHZED_ENABLED: "true" }, ctx);
    if (values.AUTHZED_CONSISTENCY !== "fully_consistent") {
      // Name the value found: a pre-v6 .env carries `minimize_latency`, and the fix is a one-line edit.
      // Safe to echo — the schema has already narrowed it to an enum member or undefined.
      const current =
        values.AUTHZED_CONSISTENCY === undefined ? "is not set" : `is "${values.AUTHZED_CONSISTENCY}"`;
      addEnvIssue(
        ctx,
        "AUTHZED_CONSISTENCY",
        `Forms v6 requires AUTHZED_CONSISTENCY=fully_consistent, but it ${current}. Set AUTHZED_CONSISTENCY=fully_consistent in your .env or deployment environment and restart. See /`
      );
    }
  }).safeParse(env);

  if (!result.success) {
    throwEnvValidationError(result.error.issues);
  }
};

/**
 * Refuse to start without an auth secret.
 *
 * Deliberately a runtime assertion rather than a module-eval refinement — see
 * `ZAuthConfigurationEnv`. Called from `instrumentation.ts` (behind the build-phase guard) and from
 * `scripts/docker/validate-env.ts --server`, which the container entrypoint runs before migrations.
 * Without it, a fresh install that set neither variable signs in and only then discovers that invites
 * and verification links cannot be minted.
 */
export const assertAuthRuntimeConfiguration = (): void => {
  const result = ZAuthConfigurationEnv.superRefine(validateAuthConfiguration).safeParse(env);

  if (!result.success) {
    throwEnvValidationError(result.error.issues);
  }
};

/**
 * Warn about the two auth-secret configurations that work but will bite.
 *
 * Never logs the secrets, their lengths, or any prefix of them: this goes to pino and on to SigNoz,
 * and the precedent for anything secret-adjacent is `auth.ts`'s `sendVerificationEmail`, which logs
 * the domain and never the address, the token, or the URL.
 */
export const warnOnAuthSecretRisks = (): void => {
  // Compared verbatim: two secrets differing only in trailing whitespace ARE different secrets, and
  // that is exactly the pair an operator most needs told about.
  const betterAuthSecret = env.BETTER_AUTH_SECRET;
  const nextAuthSecret = env.NEXTAUTH_SECRET;

  // The add-instead-of-rename footgun: BETTER_AUTH_SECRET wins, so adding it with a NEW value rather
  // than moving the existing one across silently invalidates every session and every outstanding
  // invite, verification and email-change link.
  if (betterAuthSecret && nextAuthSecret && betterAuthSecret !== nextAuthSecret) {
    logger.warn(
      "BETTER_AUTH_SECRET and NEXTAUTH_SECRET are both set to different values. BETTER_AUTH_SECRET wins, " +
        "so sessions and outstanding invite, verification and email-change links signed with the other one " +
        "are no longer valid. To keep them, set BETTER_AUTH_SECRET to the value NEXTAUTH_SECRET already had."
    );
  }

  // Better Auth warns below 32 too; ours is the actionable version, since we accept the shorter value.
  const resolvedSecret = betterAuthSecret ?? nextAuthSecret;
  if (resolvedSecret && resolvedSecret.length < 32) {
    logger.warn(
      "The configured auth secret is shorter than the recommended 32 characters. It signs session " +
        "cookies and every invite, verification and email-change token, so a short one is worth rotating " +
        "— generate a replacement with `openssl rand -hex 32`. Rotating invalidates existing sessions and links."
    );
  }
};
