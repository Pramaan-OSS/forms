import { beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { PramaanError } from "@forms/pramaan";
import { FakePramaan } from "@forms/pramaan/fake";
import { analyzeResponse, translateAnswer } from "./service";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pramaan", () => ({
  get pramaan() {
    return state.client;
  },
}));
vi.mock("@forms/database", () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    responseTextAnalysis: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/survey/utils", () => ({
  getElementsFromBlocks: () => [
    { id: "open", type: "openText" },
    { id: "choice", type: "multipleChoiceSingle" },
  ],
}));
let fake: FakePramaan;
beforeEach(() => {
  vi.resetAllMocks();
  fake = new FakePramaan({});
  state.client = fake;
});
const survey = { blocks: [] } as never;
const response = { id: "response-1", data: { open: "A good day", choice: "one" } };
test("text tools are off by default and never call the platform", async () => {
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ config: {} } as never);
  await analyzeResponse("workspace-1", response, survey);
  await expect(translateAnswer("hello", "workspace-1")).rejects.toThrow();
  expect(fake.calls).toHaveLength(0);
});
test("analyzes only text answers and stores only the approved fields", async () => {
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
    config: { textTools: { enabled: true, language: "de" } },
  } as never);
  fake.route({
    "text.sentiment.analyze": () => ({ sentiment: "positive", confidence: 0.9, provider: "hidden" }),
    "text.language.detect": () => ({ language: "en" }),
  });
  await analyzeResponse("workspace-1", response, survey);
  expect(fake.callsTo("text.sentiment.analyze")).toEqual([{ text: "A good day" }]);
  expect(prisma.responseTextAnalysis.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: {
        responseId: "response-1",
        data: { open: { sentiment: "positive", confidence: 0.9, language: "en" } },
      },
    })
  );
});
test("translates on demand into the workspace language and rejects oversize answers", async () => {
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
    config: { textTools: { enabled: true, language: "de" } },
  } as never);
  fake.route({ "text.translate": () => ({ text: "Hallo" }) });
  expect(await translateAnswer("Hello", "workspace-1")).toBe("Hallo");
  expect(fake.callsTo("text.translate")).toEqual([{ text: "Hello", targetLanguage: "de" }]);
  await expect(translateAnswer("x".repeat(5001), "workspace-1")).rejects.toThrow();
  expect(fake.callsTo("text.translate")).toHaveLength(1);
});

test("keeps the paid sentiment result when language detection is unavailable", async () => {
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
    config: { textTools: { enabled: true, language: "de" } },
  } as never);
  fake.route({
    "text.sentiment.analyze": () => ({ sentiment: "positive", confidence: 0.9 }),
    "text.language.detect": () => {
      throw new PramaanError("upstream_unavailable", "Unavailable");
    },
  });
  await analyzeResponse("workspace-1", response, survey);
  expect(prisma.responseTextAnalysis.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: { responseId: response.id, data: { open: { sentiment: "positive", confidence: 0.9 } } },
    })
  );
  expect(fake.callsTo("text.sentiment.analyze")).toHaveLength(1);
});

test("keeps detected language when sentiment is unavailable", async () => {
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
    config: { textTools: { enabled: true } },
  } as never);
  fake.route({
    "text.sentiment.analyze": () => {
      throw new PramaanError("upstream_unavailable", "Unavailable");
    },
    "text.language.detect": () => ({ language: "en" }),
  });
  await analyzeResponse("workspace-1", response, survey);
  expect(prisma.responseTextAnalysis.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: { responseId: response.id, data: { open: { language: "en" } } },
    })
  );
});

test("reports total unavailability without saving an empty success marker", async () => {
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
    config: { textTools: { enabled: true } },
  } as never);
  const unavailable = () => {
    throw new PramaanError("upstream_unavailable", "Unavailable");
  };
  fake.route({ "text.sentiment.analyze": unavailable, "text.language.detect": unavailable });
  await expect(analyzeResponse("workspace-1", response, survey)).rejects.toThrow(
    "Text analysis is not available yet."
  );
  expect(prisma.responseTextAnalysis.upsert).not.toHaveBeenCalled();
});
