"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { ResourceNotFoundError } from "@forms/types/errors";
import { ZUserEmail } from "@forms/types/user";
import { WEBAPP_URL } from "@/lib/constants";
import { actionClient } from "@/lib/utils/action-client";
import { MAX_CALLBACK_URL_LENGTH, getValidatedCallbackUrl } from "@/lib/utils/url";
import { auth } from "@/modules/auth/lib/auth";
import {
  SIGNUP_INTENT_COOKIE_NAME,
  SIGNUP_INTENT_COOKIE_OPTIONS,
  classifySignupIntent,
  createSignupIntentToken,
} from "@/modules/auth/lib/signup-intent";
import { getUserByEmail } from "@/modules/auth/lib/user";
import { applyIPRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";

const ZResendVerificationEmailAction = z.object({
  email: ZUserEmail,
  // The same bound `getValidatedCallbackUrl` enforces, so a callback this action accepts is one the
  // verify screen may open.
  callbackUrl: z.string().max(MAX_CALLBACK_URL_LENGTH).optional(),
});

export const resendVerificationEmailAction = actionClient
  .inputSchema(ZResendVerificationEmailAction)
  .action(async ({ parsedInput }) => {
    await applyIPRateLimit(rateLimitConfigs.auth.verifyEmail);

    const user = await getUserByEmail(parsedInput.email);
    if (!user) {
      throw new ResourceNotFoundError("user", parsedInput.email);
    }
    const validatedCallbackUrl = getValidatedCallbackUrl(parsedInput.callbackUrl, WEBAPP_URL) ?? undefined;

    if (user.emailVerified) {
      return {
        success: true,
      };
    }

    // Email verification is Better Auth-native: BA mints its own verification token and sends the
    // verify link through the emailVerification.sendVerificationEmail callback in auth.ts. The user is
    // unverified here (the guard above returned for verified users), so BA takes its no-session,
    // enumeration-safe path.
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: validatedCallbackUrl },
      headers: await headers(),
    });

    // Re-pair the sign-up intent cookie with the link just minted. Strictly a refresh — the browser
    // must already hold a valid cookie naming THIS user — so it extends evidence the browser has, and
    // never arms one that lacks it. Non-fatal: the email has already gone out, so a failure here must
    // cost exactly the auto-sign-in UX, never the resend itself.
    try {
      const cookieStore = await cookies();
      if (classifySignupIntent(cookieStore.get(SIGNUP_INTENT_COOKIE_NAME)?.value, user.id) === "valid") {
        cookieStore.set(
          SIGNUP_INTENT_COOKIE_NAME,
          createSignupIntentToken(user.id),
          SIGNUP_INTENT_COOKIE_OPTIONS
        );
      }
    } catch {
      // best-effort; the resend itself has succeeded
    }

    return {
      success: true,
    };
  });
