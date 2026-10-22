import { type NextRequest, NextResponse } from "next/server";
import { WEBAPP_URL } from "@/lib/constants";
import { resolveAuthCallbackUrl } from "@/modules/auth/lib/callback-url";
import { getOAuthErrorVariant } from "@/modules/auth/lib/oauth-error";
import {
  SOCIAL_SIGN_IN_COOKIE,
  attemptSecret,
  decodeAttempt,
  exchangeCodeForIdentity,
  findOrCreateUserForIdentity,
  sessionCookieFor,
  startAppSession,
} from "@/modules/auth/lib/pramaan-signin/session";

export const dynamic = "force-dynamic";

const loginUrl = (request: NextRequest, errorCode: string): NextResponse =>
  NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(errorCode)}`, request.url));

/**
 * GET /api/auth/pramaan/callback/[provider] — finish a social sign-in: compare
 * the state the visitor carries with the one this instance issued, redeem the
 * code on the platform, then open this app's own session for that identity.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const attemptCookie = request.cookies.get(SOCIAL_SIGN_IN_COOKIE)?.value;
  const attempt = decodeAttempt(attemptCookie, attemptSecret());

  if (!attempt || attempt.providerKey !== provider || !code || !state || state !== attempt.state) {
    return loginUrl(request, getOAuthErrorVariant("state_mismatch") ?? "generic");
  }

  try {
    const redirectUri = `${url.origin}/api/auth/pramaan/callback/${provider}`;
    const identity = await exchangeCodeForIdentity({
      providerKey: provider,
      code,
      redirectUri,
      state: attempt.state,
      nonce: attempt.nonce,
      pkceVerifier: attempt.pkceVerifier,
    });

    const user = await findOrCreateUserForIdentity(identity);
    const session = await startAppSession(user.id, request);

    const redirectToParam = url.searchParams.get("redirect_to");
    const destination =
      resolveAuthCallbackUrl({
        searchParamCallbackUrl: redirectToParam ?? undefined,
        webAppUrl: WEBAPP_URL,
      }) ?? WEBAPP_URL;

    const response = NextResponse.redirect(new URL(destination));
    const cookie = sessionCookieFor(session.token, session.expiresAt);
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      httpOnly: cookie.attributes.httpOnly,
      sameSite: cookie.attributes.sameSite,
      secure: cookie.attributes.secure,
      path: cookie.attributes.path,
      expires: cookie.attributes.expires,
    });
    response.cookies.set({ name: SOCIAL_SIGN_IN_COOKIE, value: "", path: "/", maxAge: 0 });
    return response;
  } catch {
    // The code is single-use: after any error the visitor starts again.
    return loginUrl(request, "internal_server_error");
  }
}
