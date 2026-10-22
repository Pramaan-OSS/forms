import { beforeEach, expect, test, vi } from "vitest";
import { FakePramaan } from "@forms/pramaan/fake";

const state = vi.hoisted(() => ({ client: null as FakePramaan | null }));
vi.mock("@forms/pramaan", async (original) => ({
  ...(await original<typeof import("@forms/pramaan")>()),
  pramaanFromEnv: () => state.client,
}));
beforeEach(() => {
  vi.resetModules();
});
test("preparing the bucket sends an action identifier accepted by the strict fake", async () => {
  state.client = new FakePramaan({
    "storage.buckets.list": () => ({ results: [] }),
    "storage.bucket.create": () => ({}),
  });
  const { ensureBucket } = await import("./client");
  expect(await ensureBucket()).toBe(true);
  expect(
    state.client.calls.find((call) => call.id === "storage.bucket.create")?.opts?.idempotencyKey
  ).toBeTruthy();
});
