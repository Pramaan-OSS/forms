import { describe, expect, test, vi } from "vitest";
import { MISSING_ACTION_KEY, safeActionFailureReason } from "./action-policy";
import { CATALOG } from "./catalog";
import { FakePramaan } from "./fake";
import { type CapId, Pramaan, PramaanClient, PramaanError } from "./index";
import { runtimeFakeFetch } from "./runtime-fake";

const actions = Object.keys(CATALOG).filter((id) => CATALOG[id].effectClass !== "read_only") as CapId[];

describe("required action headers", () => {
  test.each(actions)("fake refuses %s before routing when the action key is absent", async (id) => {
    const route = vi.fn();
    const fake = new FakePramaan({ [id]: route });
    await expect(fake.call(id, {})).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
      message: MISSING_ACTION_KEY,
    });
    expect(route).not.toHaveBeenCalled();
  });
  test.each([undefined, "", "   "])("offline HTTP refuses a missing or blank action header", async (key) => {
    const response = await runtimeFakeFetch(
      "https://platform.example.test/v1/capabilities/auth.backend.provision",
      {
        method: "POST",
        body: "{}",
        headers: key === undefined ? {} : { "Idempotency-Key": key },
      }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: MISSING_ACTION_KEY },
    });
  });
  test("the package wrapper refuses an action when its saved key is missing", async () => {
    const client = new PramaanClient({ apiKey: "fake", fetch: runtimeFakeFetch });
    await expect(client.call("auth.backend.provision", {})).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
      message: MISSING_ACTION_KEY,
    });
  });
  test.each([
    "auth.backend.provision",
    "db.postgres.provision",
    "auth.backend.domains.set",
    "auth.user.delete",
  ] as const)("serializes the supplied key into the actual %s HTTP request", async (id) => {
    let header: string | null = null;
    const client = new Pramaan(
      new PramaanClient({
        apiKey: "fake",
        fetch: async (url, init) => {
          header = new Headers(init?.headers).get("Idempotency-Key");
          return runtimeFakeFetch(url, init!);
        },
      })
    );
    await client
      .call(id, { userId: "offline-user", confirm: true }, { idempotencyKey: "saved-request-identifier" })
      .catch((error) => {
        // The offline database deliberately models the production availability fallback.
        if (id !== "db.postgres.provision") throw error;
        expect(error).toMatchObject({ code: "upstream_unavailable" });
      });
    expect(header).toBe("saved-request-identifier");
  });
  test("the shared client refuses an action before sending without a key", async () => {
    const fetch = vi.fn();
    const client = new Pramaan(new PramaanClient({ apiKey: "fake", fetch }));
    await expect(client.call("auth.backend.provision", {})).rejects.toThrow(MISSING_ACTION_KEY);
    await expect(client.run("db.postgres.provision", {})).rejects.toThrow(MISSING_ACTION_KEY);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("read calls do not need an action identifier", async () => {
    const fake = new FakePramaan({ "auth.token.verify": () => ({ valid: false }) });
    expect(await fake.call("auth.token.verify", { token: "changed" })).toEqual({ valid: false });
  });
  test("refusal reasons expose the missing header while hiding arbitrary upstream details", () => {
    expect(safeActionFailureReason(new PramaanError("invalid_request", MISSING_ACTION_KEY))).toBe(
      MISSING_ACTION_KEY
    );
    expect(
      safeActionFailureReason(new PramaanError("invalid_request", "private-key https://provider.example/"))
    ).toBe("The request was invalid.");
    expect(safeActionFailureReason(new PramaanError("unauthorized", "private-key"))).toBe(
      "The API key was refused."
    );
  });
});
