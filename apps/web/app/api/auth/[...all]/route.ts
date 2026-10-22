import { auth } from "@/modules/auth/lib/auth";
import { createAuthPathLabeller } from "@/modules/auth/lib/better-auth-path-label";
import { runWithBetterAuthRequestContext } from "@/modules/auth/lib/better-auth-request-context";
import { runWithEmailVerificationRequestContext } from "@/modules/auth/lib/email-verification-request-context";
import { prepareDcrRequest } from "@/modules/auth/lib/mcp-dcr-application-type";

// Force-no-store so Better Auth's outbound fetches (token exchange, JWKS) are never served from
// Next's fetch cache.
export const fetchCache = "force-no-store";

/**
 * Derived once from Better Auth's own endpoint registry (each endpoint function carries its DECLARED
 * path), so the label vocabulary tracks plugin and version changes with no hand-maintained list — and
 * a parameterized route can never be emitted with its parameter filled in. See
 * better-auth-path-label.ts; `/reset-password/:token` is why this is not the raw pathname.
 */
// `endpoint?.path`, not `endpoint.path`: this runs at MODULE LOAD in the `/api/auth/*` catch-all, so a
// single null or undefined entry in `auth.api` would throw here and take down every auth request — the
// whole route, not just the label. The labeller already ignores any non-string, so a nullish entry
// degrades that one endpoint to `unknown` instead of breaking sign-in.
const labelAuthPath = createAuthPathLabeller(Object.values(auth.api).map((endpoint) => endpoint?.path));

/**
 * Better Auth HTTP handler. It also serves dynamic client registration for the
 * in-product MCP server: `prepareDcrRequest` validates `application_type` and
 * the redirect-URI allowlist before Better Auth sees the request, rejecting
 * registrations whose redirect URIs are neither loopback nor an exact connector
 * callback. All three normalisations no-op otherwise.
 */
const handler = async (request: Request): Promise<Response> => {
  const preparedRequest = await prepareDcrRequest(request);
  if (preparedRequest instanceof Response) return preparedRequest;
  const mappedRequest = preparedRequest;
  return runWithBetterAuthRequestContext(
    { path: labelAuthPath(mappedRequest.url), method: mappedRequest.method },
    () =>
      // ENG-2562: carries "this request just verified an email" from Better Auth's
      // `afterEmailVerification` hook to the `hooks.after` chain, which is where the session can
      // actually be minted. Innermost because it is the narrowest scope of the three — one endpoint,
      // not the whole handler.
      runWithEmailVerificationRequestContext(() => auth.handler(mappedRequest))
  );
};

export { handler as GET, handler as POST };
