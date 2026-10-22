import { type NextRequest, NextResponse } from "next/server";
import { WEBAPP_URL } from "@/lib/constants";
import { pramaan } from "@/lib/pramaan";
import {
  SOCIAL_SIGN_IN_COOKIE,
  attemptSecret,
  codeChallengeOf,
  encodeAttempt,
  newSignInAttempt,
} from "@/modules/auth/lib/pramaan-signin/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/pramaan/enterprise/[connectionRef] — start an enterprise
 * sign-in through one saved connection: the platform returns the one-time
 * authorization link, this instance keeps state, nonce and verifier in a
 * signed cookie. Off when no key is configured or the connection is unknown.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connectionRef: string }> }
): Promise<NextResponse> {
  const { connectionRef } = await context.params;
  if (!pramaan) {
    return NextResponse.redirect(new URL("/auth/login?error=oauth_provider_not_found", request.url));
  }

  const redirectUri = `${new URL(request.url).origin}/api/auth/pramaan/callback/enterprise`;
  const attempt = newSignInAttempt({ providerKey: "enterprise", connectionRef, callbackUrl: WEBAPP_URL });

  try {
    const { authorizationUrl } = (await pramaan.call("auth.enterprise.start", {
      connectionRef,
      redirectUri,
      state: attempt.state,
      nonce: attempt.nonce,
      codeChallenge: codeChallengeOf(attempt.pkceVerifier),
    })) as { authorizationUrl?: string };

    if (!authorizationUrl) throw new Error("The sign-in start carried no link.");

    const response = NextResponse.redirect(new URL(authorizationUrl));
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
  } catch {
    return NextResponse.redirect(new URL("/auth/login?error=oauth_provider_not_found", request.url));
  }
}
