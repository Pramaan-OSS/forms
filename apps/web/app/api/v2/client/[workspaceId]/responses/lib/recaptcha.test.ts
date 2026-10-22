import { FakePramaan } from "@forms/pramaan/fake";
import { beforeEach, expect, test, vi } from "vitest";
import { verifyRecaptchaToken } from "./recaptcha";

const state = vi.hoisted(() => ({ client: null as unknown, widget: "challenge" as string | undefined }));
vi.mock("@/lib/pramaan", () => ({
  get pramaan() {
    return state.client;
  },
}));
vi.mock("@/lib/env", () => ({
  env: {
    get PRAMAAN_BOT_CHECK_WIDGET() {
      return state.widget;
    },
  },
}));
let fake: FakePramaan;
beforeEach(() => {
  fake = new FakePramaan({});
  state.client = fake;
  state.widget = "challenge";
});
test("verifies only through the capability and checks its passed field", async () => {
  fake.route({ "auth.bot-check.verify": () => ({ passed: true }) });
  expect(await verifyRecaptchaToken("token", 0.7)).toBe(true);
  expect(fake.callsTo("auth.bot-check.verify")).toEqual([
    { token: "token", widget: "challenge", minimumScore: 0.7 },
  ]);
});
test("fails closed when disabled, unavailable or rejected", async () => {
  state.widget = undefined;
  expect(await verifyRecaptchaToken("token", 0.5)).toBe(false);
  state.widget = "challenge";
  fake.route({ "auth.bot-check.verify": () => ({ passed: false }) });
  expect(await verifyRecaptchaToken("token", 0.5)).toBe(false);
  fake.route({
    "auth.bot-check.verify": () => {
      throw new Error("unavailable");
    },
  });
  expect(await verifyRecaptchaToken("token", 0.5)).toBe(false);
});
