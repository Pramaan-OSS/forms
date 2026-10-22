import { NextResponse } from "next/server";
import { WEBAPP_URL } from "@/lib/constants";
import { resolveAuthCallbackUrl } from "@/modules/auth/lib/callback-url";
import { sessionCookieFor } from "@/modules/auth/lib/pramaan-signin/session";
import { openManagedSession } from "@/modules/auth/managed/session";
import { applyIPRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (
    request.headers.get("origin") !== new URL(WEBAPP_URL).origin ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return NextResponse.json({ error: "Sign-in could not be verified." }, { status: 403, headers });
  try {
    await applyIPRateLimit(rateLimitConfigs.auth.login);
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      token?: unknown;
      callbackUrl?: unknown;
    };
    if (
      typeof input.token !== "string" ||
      input.token.length > 8192 ||
      (input.callbackUrl !== undefined && typeof input.callbackUrl !== "string")
    )
      throw new Error();
    const destination =
      resolveAuthCallbackUrl({
        searchParamCallbackUrl: input.callbackUrl as string | undefined,
        webAppUrl: WEBAPP_URL,
      }) || WEBAPP_URL;
    const session = await openManagedSession(input.token, destination, request);
    const cookie = sessionCookieFor(session.token, session.expiresAt);
    const response = NextResponse.json({ destination }, { headers });
    response.cookies.set(cookie.name, cookie.value, cookie.attributes);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Sign-in could not be verified. Start again from the sign-in page." },
      { status: 401, headers }
    );
  }
}
