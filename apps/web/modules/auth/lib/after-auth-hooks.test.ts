import { describe, expect, test, vi } from "vitest";
import { runAfterAuthHooks } from "./after-auth-hooks";
import { verificationAutoSignInAfterHandler } from "./better-auth-verification-autosignin";
import {
  requireOAuthConsentOnRefreshAfterHandler,
  revokeTokensBeyondConsentAfterHandler,
} from "./oauth-grant-revocation";

vi.mock("./better-auth-verification-autosignin", () => ({
  verificationAutoSignInAfterHandler: vi.fn(),
}));
vi.mock("./oauth-grant-revocation", () => ({
  requireOAuthConsentOnRefreshAfterHandler: vi.fn(),
  revokeTokensBeyondConsentAfterHandler: vi.fn(),
}));

describe("runAfterAuthHooks", () => {
  test("runs the auto-sign-in grant first, then the OAuth-consent handlers in order", async () => {
    const calls: string[] = [];
    vi.mocked(verificationAutoSignInAfterHandler).mockImplementation(async () => {
      calls.push("verification-auto-sign-in");
    });
    vi.mocked(requireOAuthConsentOnRefreshAfterHandler).mockImplementation(async () => {
      calls.push("oauth-refresh-consent");
    });
    vi.mocked(revokeTokensBeyondConsentAfterHandler).mockImplementation(async () => {
      calls.push("oauth-consent-narrowed");
    });

    await runAfterAuthHooks({} as never);

    // The auto-sign-in handler is the only one here that GRANTS something, so it runs first; the
    // OAuth-consent handlers only touch /oauth2/token, /oauth2/consent and /oauth2/update-consent,
    // so their relative order is pinned so a reorder is a deliberate edit.
    expect(calls).toEqual(["verification-auto-sign-in", "oauth-refresh-consent", "oauth-consent-narrowed"]);
  });
});
