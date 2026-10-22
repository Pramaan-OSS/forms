"use server";

import { z } from "zod";
import { verifyEmailChangeToken } from "@/lib/jwt";
import { actionClient } from "@/lib/utils/action-client";
import { updateUser } from "@/modules/auth/lib/user";
import { applyIPRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";

export const verifyEmailChangeAction = actionClient
  .inputSchema(z.object({ token: z.string() }))
  .action(async ({ parsedInput }) => {
    await applyIPRateLimit(rateLimitConfigs.auth.verifyEmail);

    // Unauthenticated on purpose — the link is clicked from the new mailbox, often in another browser.
    // What makes that safe is the token's binding to the credential state it was issued under
    // (verifyEmailChangeToken), so a password reset or a prior email change kills it (ENG-2106).
    const { id, email } = await verifyEmailChangeToken(parsedInput.token);

    if (!email) {
      throw new Error("Email not found in token");
    }
    const user = await updateUser(id, { email, emailVerified: true });
    if (!user) {
      throw new Error("User not found or email update failed");
    }

    return user;
  });
