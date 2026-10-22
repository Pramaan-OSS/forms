import { beforeEach, expect, test, vi } from "vitest";
import { PramaanError } from "@forms/pramaan";
import { FakePramaan } from "@forms/pramaan/fake";
import { deleteManagedUser } from "./user-lifecycle";

const state = vi.hoisted(() => ({ client: null as FakePramaan | null, log: vi.fn() }));
vi.mock("@forms/logger", () => ({ logger: { error: state.log } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pramaan", () => ({
  get pramaan() {
    return state.client;
  },
}));
vi.mock("./backend", () => ({
  managedBackend: () => ({
    authUrl: "https://signin.example.test/auth",
    jwksUrl: "https://signin.example.test/keys",
  }),
}));
beforeEach(() => {
  state.log.mockClear();
  state.client = new FakePramaan({ "auth.user.delete": () => ({ deleted: true }) });
});
test("deletes only a confirmed identity on this backend with an idempotency key", async () => {
  await deleteManagedUser("managed:https://signin.example.test:user_test", "local-user");
  expect(state.client!.callsTo("auth.user.delete")[0]).toEqual({ userId: "user_test", confirm: true });
  expect(state.client!.calls[0].opts?.idempotencyKey).toBeTruthy();
});
test("local users make no backend deletion call", async () => {
  await deleteManagedUser(undefined, "local-user");
  await deleteManagedUser("own-client-subject", "local-user");
  expect(state.client!.calls).toHaveLength(0);
});
test("refuses identities on another backend", async () => {
  await expect(
    deleteManagedUser("managed:https://another.example.test:user_test", "local-user")
  ).rejects.toThrow();
  expect(state.client!.calls).toHaveLength(0);
});
test("an already deleted remote identity may finish its local deletion", async () => {
  state.client!.route({
    "auth.user.delete": () => {
      throw new PramaanError("not_found", "private");
    },
  });
  await expect(
    deleteManagedUser("managed:https://signin.example.test:user_test", "local-user")
  ).resolves.toBeUndefined();
});
test("uncertain remote deletion is refused without exposing remote details", async () => {
  state.client!.route({
    "auth.user.delete": () => {
      throw new PramaanError("upstream_unavailable", "private details");
    },
  });
  await expect(
    deleteManagedUser("managed:https://signin.example.test:user_test", "local-user")
  ).rejects.toThrow("Managed account deletion could not be confirmed.");
});

test("repeated confirmed deletion reuses its identifier from the persisted local identity", async () => {
  await deleteManagedUser("managed:https://signin.example.test:user_test", "local-user");
  await deleteManagedUser("managed:https://signin.example.test:user_test", "local-user");
  expect(state.client!.calls[0].opts?.idempotencyKey).toBe(state.client!.calls[1].opts?.idempotencyKey);
});
test("a refused deletion logs the safe refusal reason without upstream details", async () => {
  state.client!.route({
    "auth.user.delete": () => {
      throw new PramaanError("unauthorized", "private-key https://provider.example/");
    },
  });
  await expect(
    deleteManagedUser("managed:https://signin.example.test:user_test", "local-user")
  ).rejects.toThrow();
  expect(state.log).toHaveBeenCalledExactlyOnceWith(
    { reason: "The API key was refused." },
    "Managed account deletion was refused"
  );
});
