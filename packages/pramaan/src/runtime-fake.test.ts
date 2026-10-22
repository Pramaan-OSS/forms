import { expect, test } from "vitest";
import { runtimeFakeFetch } from "./runtime-fake";

const call = async (id: string, input: unknown = {}) =>
  (
    await runtimeFakeFetch(`https://platform.example.test/v1/capabilities/${id}`, {
      method: "POST",
      headers: { "Idempotency-Key": "test-action" },
      body: JSON.stringify(input),
    })
  ).json();
test("offline backend provision returns a development address and database stays unavailable", async () => {
  expect(await call("auth.backend.provision")).toMatchObject({
    status: "ready",
    authUrl: "https://signin.example.test/auth",
  });
  expect(await call("db.postgres.provision")).toMatchObject({ error: { code: "upstream_unavailable" } });
});
test("offline authentication refuses arbitrary or altered tokens", async () => {
  for (const token of ["made-up", "eyJ0ZXN0Ijp0cnVlfQ.eyJzdWIiOiJvZmZsaW5lLXVzZXIifQ.altered"]) {
    expect(await call("auth.token.verify", { token })).toEqual({ valid: false });
  }
});
test("only the explicit browser fixture token selects the offline identity", async () => {
  expect(
    await call("auth.token.verify", {
      token:
        "eyJ0ZXN0Ijp0cnVlfQ.eyJzdWIiOiJvZmZsaW5lLXVzZXIiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUudGVzdCIsImVtYWlsVmVyaWZpZWQiOnRydWUsIm5hbWUiOiJMb2NhbCBhZG1pbmlzdHJhdG9yIn0.offline-signature",
    })
  ).toEqual({
    valid: true,
    userId: "offline-user",
    sessionId: "offline-session",
    orgId: null,
    expiresAt: "2099-01-01T00:00:00Z",
  });
});
