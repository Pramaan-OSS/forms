import { beforeEach, expect, test, vi } from "vitest";
import type { TResponsePipelineJobData } from "@forms/jobs";
import { FakePramaan } from "@forms/pramaan/fake";
import type { TIntegration } from "@forms/types/integration";
import { mapResponseInput } from "@/modules/connected-apps/lib/response-input";
import { handleIntegrations } from "./handle-integrations";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pramaan", () => ({
  get pramaan() {
    return state.client;
  },
}));
const response = {
  id: "response-1",
  createdAt: new Date("2026-10-15T00:00:00Z"),
  data: { answer: ["one", "two"] },
};
const payload = { surveyId: "survey-1", response } as unknown as TResponsePipelineJobData;
const integration = (app: string) =>
  ({
    id: "mapping-1",
    workspaceId: "workspace-1",
    type: app === "googlesheets" ? "googleSheets" : app,
    config: {
      connectedApp: true,
      userId: "user-1",
      app,
      data: [
        {
          surveyId: "survey-1",
          createdAt: new Date(),
          query: "append response",
          action: "runtime-action",
          input: { row: "{{answers.answer}}", survey: "{{survey.name}}" },
        },
      ],
    },
  }) as TIntegration;
let fake: FakePramaan;
beforeEach(() => {
  fake = new FakePramaan({});
  state.client = fake;
});

test.each(["googlesheets", "airtable", "notion", "slack"])(
  "delivers through a discovered action for %s",
  async (app) => {
    fake.route({
      "apps.catalog.search": () => ({
        results: [
          {
            app,
            action: "runtime-action",
            inputSchema: {
              type: "object",
              required: ["row"],
              properties: { row: { type: "array" }, survey: { type: "string" } },
            },
          },
        ],
      }),
      "apps.action.execute": () => ({ status: "succeeded", output: {} }),
    });
    await handleIntegrations([integration(app)], payload, { name: "Survey" });
    expect(fake.callsTo("apps.action.execute")).toHaveLength(1);
    expect(fake.callsTo("apps.action.execute")[0]).toMatchObject({
      action: "runtime-action",
      input: { row: ["one", "two"], survey: "Survey" },
    });
  }
);

test("skips other surveys and legacy credentials", async () => {
  const other = integration("slack");
  other.config.data[0].surveyId = "different";
  await handleIntegrations(
    [other, { ...other, config: { key: { access_token: "old" }, data: [] } } as unknown as TIntegration],
    payload,
    { name: "Survey" }
  );
  expect(fake.callsTo("apps.action.execute")).toHaveLength(0);
});

test("refuses actions outside the app and changed required fields", async () => {
  for (const item of [
    { app: "other", action: "runtime-action", inputSchema: {} },
    { app: "slack", action: "runtime-action", inputSchema: { type: "object", required: ["destination"] } },
  ]) {
    fake.route({ "apps.catalog.search": () => ({ results: [item] }) });
    await handleIntegrations([integration("slack")], payload, { name: "Survey" });
  }
  expect(fake.callsTo("apps.action.execute")).toHaveLength(0);
});

test("never retries an uncertain write", async () => {
  fake.route({
    "apps.catalog.search": () => ({
      results: [{ app: "slack", action: "runtime-action", inputSchema: { type: "object" } }],
    }),
    "apps.action.execute": () => {
      throw new Error("unknown effect");
    },
  });
  await expect(
    handleIntegrations([integration("slack")], payload, { name: "Survey" })
  ).resolves.toBeUndefined();
  expect(fake.callsTo("apps.action.execute")).toHaveLength(1);
});

test("maps nested whole values while preserving arrays and literal text", () => {
  expect(
    mapResponseInput(
      { list: ["{{answers.answer}}"], object: { id: "{{response.id}}" }, literal: "Value {{survey.name}}" },
      response,
      "Survey"
    )
  ).toEqual({ list: [["one", "two"]], object: { id: "response-1" }, literal: "Value {{survey.name}}" });
});
