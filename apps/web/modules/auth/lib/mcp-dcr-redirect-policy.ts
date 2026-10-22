import "server-only";
import { logger } from "@forms/logger";
import { env } from "@/lib/env";

/**
 * Anonymous OAuth registration allows local loopback callbacks and exact hosted
 * callbacks configured by the operator in MCP_DCR_ALLOWED_REDIRECT_URIS.
 * No hosted callbacks are enabled by default. No prefix or wildcard matching.
 * Logout callbacks remain loopback-only.
 */

const LOOPBACK_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether a redirect URI is an http loopback address (RFC 8252 §7.3). */
export const isLoopbackRedirectUri = (uri: unknown): boolean => {
  if (typeof uri !== "string") return false;
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && LOOPBACK_REDIRECT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

/** The exact-match set: operator-configured hosted callbacks. */
const buildAllowedDcrRedirectUris = (operatorUris: readonly string[] = []): ReadonlySet<string> =>
  new Set<string>(operatorUris);

/** Origin and path only: a callback's query string can carry a per-tenant secret, and logs leave the box. */
const describeRedirectUri = (uri: string): string => {
  const url = new URL(uri);
  return `${url.origin}${url.pathname}`;
};

let allowedDcrRedirectUris: ReadonlySet<string> | undefined;

/** The allowlist this process enforces. Built once; env does not change at runtime. */
export const getAllowedDcrRedirectUris = (): ReadonlySet<string> => {
  if (!allowedDcrRedirectUris) {
    const operatorUris = env.MCP_DCR_ALLOWED_REDIRECT_URIS ?? [];
    if (operatorUris.length > 0) {
      logger.info(
        { redirectUris: operatorUris.map(describeRedirectUri) },
        "MCP_DCR_ALLOWED_REDIRECT_URIS adds redirect URIs to anonymous OAuth client registration"
      );
    }
    allowedDcrRedirectUris = buildAllowedDcrRedirectUris(operatorUris);
  }
  return allowedDcrRedirectUris;
};

/** Whether anonymous DCR may register this `redirect_uris` entry: loopback, or an exact allowlisted URI. */
export const isAllowedDcrRedirectUri = (uri: unknown, allowed: ReadonlySet<string>): boolean =>
  isLoopbackRedirectUri(uri) || (typeof uri === "string" && allowed.has(uri));

const REDIRECT_URI_FIELDS = ["redirect_uris", "post_logout_redirect_uris"] as const;

type TRedirectUriField = (typeof REDIRECT_URI_FIELDS)[number];

export type TDisallowedRedirectUri = {
  field: TRedirectUriField;
  uri: string;
};

const isAllowedForField = (field: TRedirectUriField, uri: string, allowed: ReadonlySet<string>): boolean =>
  field === "redirect_uris" ? isAllowedDcrRedirectUri(uri, allowed) : isLoopbackRedirectUri(uri);

/**
 * The first redirect URI in a DCR body that the allowlist rejects, or `null` when the body is not
 * JSON, not an object, or carries no redirect URIs. Those cases are Better Auth's to decide — this
 * check must only *tighten* what upstream accepts, never reject a request upstream would allow, so a
 * body with no `redirect_uris` passes through unchanged and produces upstream's own error.
 */
export const findDisallowedRedirectUri = (
  body: string,
  allowed: ReadonlySet<string>
): TDisallowedRedirectUri | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const client = parsed as Record<string, unknown>;
  for (const field of REDIRECT_URI_FIELDS) {
    const uris = client[field];
    if (!Array.isArray(uris)) continue;
    for (const uri of uris) {
      if (typeof uri === "string" && !isAllowedForField(field, uri, allowed)) return { field, uri };
    }
  }
  return null;
};
