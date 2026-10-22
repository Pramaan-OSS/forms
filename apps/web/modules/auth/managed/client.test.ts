import { describe, expect, test, vi } from "vitest";
import { managedSessionToken } from "./client";

describe("managed browser token", () => {
  test("gets the signed token from the token endpoint with the configured client", async () => {
    const $fetch = vi.fn().mockResolvedValue({ data: { token: "header.claims.signature" }, error: null });
    const client = { $fetch } as unknown as Parameters<typeof managedSessionToken>[0];
    expect(await managedSessionToken(client)).toBe("header.claims.signature");
    expect($fetch).toHaveBeenCalledExactlyOnceWith("/token", { method: "GET" });
  });
  test.each([
    { data: null, error: { message: "Not signed in" } },
    { data: { token: "opaque-session-token" }, error: null },
  ])("refuses a missing or unsigned token", async (response) => {
    const client = { $fetch: vi.fn().mockResolvedValue(response) } as unknown as Parameters<
      typeof managedSessionToken
    >[0];
    await expect(managedSessionToken(client)).rejects.toThrow("could not be verified");
  });
});
