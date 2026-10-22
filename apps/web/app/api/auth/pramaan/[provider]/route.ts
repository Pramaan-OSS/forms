import { type NextRequest, NextResponse } from "next/server";
import { WEBAPP_URL } from "@/lib/constants";
import { env } from "@/lib/env";
import { pramaan } from "@/lib/pramaan";
import {
  isSocialProviderKey,
  parseSocialSignInConfig,
  socialAuthorizationUrl,
} from "@/modules/auth/lib/pramaan-signin/config";
import {
  SOCIAL_SIGN_IN_COOKIE,
  attemptSecret,
  codeChallengeOf,
  encodeAttempt,
  newSignInAttempt,
} from "@/modules/auth/lib/pramaan-signin/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/pramaan/[provider] — start a social sign-in: one-time values in
 * a signed cookie, then the visitor off to the provider. Off until configured.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider: rawProvider } = await context.params;
  const providers = parseSocialSignInConfig(env.PRAMAAN_SOCIAL_SIGN_IN);
  const provider = providers.find((candidate) => candidate.key === rawProvider);

  if (!provider || !isSocialProviderKey(provider.key) || !pramaan) {
    return NextResponse.redirect(new URL("/auth/login?error=oauth_provider_not_found", request.url));
  }

  const redirectUri = `${new URL(request.url).origin}/api/auth/pramaan/callback/${provider.key}`;
  const attempt = newSignInAttempt({ providerKey: provider.key, callbackUrl: WEBAPP_URL });
  const authorizeUrl = new URL(
    socialAuthorizationUrl(provider, redirectUri, attempt.state, codeChallengeOf(attempt.pkceVerifier))
  );
  // The invite (or any deep link) the visitor was following survives the round trip.
  const callbackUrl = new URL(request.url).searchParams.get("callbackUrl");
  if (callbackUrl) authorizeUrl.searchParams.set("redirect_to", callbackUrl);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: SOCIAL_SIGN_IN_COOKIE,
    value: encodeAttempt(attempt, attemptSecret()),
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return response;
}
