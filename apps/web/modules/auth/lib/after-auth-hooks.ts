import "server-only";
import type { AuthHookContext } from "@/modules/auth/lib/auth-hook-context";
import { verificationAutoSignInAfterHandler } from "./better-auth-verification-autosignin";
import {
  requireOAuthConsentOnRefreshAfterHandler,
  revokeTokensBeyondConsentAfterHandler,
} from "./oauth-grant-revocation";

/**
 * Composed Better Auth `hooks.after` chain. `verificationAutoSignInAfterHandler` only touches
 * `/verify-email` and may add a session, so it runs first; the OAuth-consent handlers only touch
 * `/oauth2/token`, `/oauth2/consent` and `/oauth2/update-consent`, so they are order-independent.
 * Extracted from auth.ts so the order is unit-testable.
 */
export const runAfterAuthHooks = async (ctx: AuthHookContext): Promise<void> => {
  await verificationAutoSignInAfterHandler(ctx);
  await requireOAuthConsentOnRefreshAfterHandler(ctx);
  await revokeTokensBeyondConsentAfterHandler(ctx);
};
