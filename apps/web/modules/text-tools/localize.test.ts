import { PramaanError } from "@forms/pramaan";
import { FakePramaan } from "@forms/pramaan/fake";
import { beforeEach, expect, test, vi } from "vitest";
import { LocalizationUncertain, localizeSurveyText } from "./localize";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pramaan", () => ({
  get pramaan() {
    return state.client;
  },
}));
let fake: FakePramaan;
beforeEach(() => {
  fake = new FakePramaan({});
  state.client = fake;
});
const report = {
  status: "done",
  steps: [],
  result: { translations: [{ language: "de", text: "Hallo", notes: "Reviewed" }] },
};
test("single-language translation uses the capability", async () => {
  fake.route({ "text.translate": () => ({ text: "Hallo" }) });
  expect(await localizeSurveyText("Hello", ["de"])).toEqual({
    translations: [{ language: "de", text: "Hallo" }],
  });
});
test("several languages use the reviewed outcome", async () => {
  fake.routeOutcomes({ run: () => report });
  expect(await localizeSurveyText("Hello", ["de", "fr"])).toEqual(report.result);
  expect(fake.outcomeCalls[0]).toMatchObject({
    id: "content.localize",
    input: { text: "Hello", languages: ["de", "fr"] },
    opts: { options: { review: true } },
  });
});
test("waits for accepted jobs and requests cancellation on an unconfirmed wait", async () => {
  fake.routeOutcomes({ run: () => ({ id: "job-1", status: "running" }) });
  const cancel = vi.fn(async () => ({ id: "job-1", status: "cancelled" }));
  vi.spyOn(fake, "jobs", "get").mockReturnValue({
    wait: async () => {
      throw new PramaanError("upstream_timeout", "timeout");
    },
    cancel,
  } as never);
  await expect(localizeSurveyText("Hello", ["de", "fr"])).rejects.toThrow();
  expect(cancel).toHaveBeenCalledWith("job-1");
});
test("never retries rate limits or unknown effects", async () => {
  fake.routeOutcomes({ run: () => ({ ...report, steps: [{ effect: "unknown" }] }) });
  await expect(localizeSurveyText("Hello", ["de", "fr"])).rejects.toBeInstanceOf(LocalizationUncertain);
  fake.routeOutcomes({
    run: () => {
      throw new PramaanError("rate_limited", "wait");
    },
  });
  await expect(localizeSurveyText("Hello", ["de", "fr"])).rejects.toMatchObject({ code: "rate_limited" });
  expect(fake.outcomeCalls).toHaveLength(2);
});
