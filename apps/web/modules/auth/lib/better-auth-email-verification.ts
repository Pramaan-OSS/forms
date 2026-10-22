import "server-only";
import { markEmailJustVerified } from "./email-verification-request-context";

/**
 * The composed `afterEmailVerification` hook.
 *
 * The ENG-2562 marker is recorded FIRST and synchronously, so the auto-sign-in
 * after-hook can mint the post-verification session for the browser that
 * signed up. Analytics/CRM side effects were removed with the template's
 * third-party telemetry.
 */
export const runAfterEmailVerificationHooks = async (user: { id: string; email: string }): Promise<void> => {
  markEmailJustVerified(user.id);
};
