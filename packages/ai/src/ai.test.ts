import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { PramaanError } from "@forms/pramaan";
import { FakePramaan } from "@forms/pramaan/fake";
import {
  AIConfigurationError,
  AIInvalidReplyError,
  AIOutputTokenLimitError,
  classifyAIProviderError,
} from "./errors";
import { generateObject } from "./object";
import { isAiConfigured } from "./provider";
import { streamObject } from "./stream-object";
import { generateText } from "./text";

vi.mock("@forms/pramaan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forms/pramaan")>();
  let current: FakePramaan | null = null;
  return {
    ...actual,
    __setCurrentFake(client: FakePramaan | null) {
      current = client;
    },
    pramaanFromEnv: () => current,
    pramaanKeySet: () => current !== null,
  };
});

const { __setCurrentFake } = (await import("@forms/pramaan")) as unknown as {
  __setCurrentFake: (client: FakePramaan | null) => void;
};

let fake: FakePramaan;

const reply = (text: string, finishReason = "stop") => ({
  text,
  finishReason,
  usage: { inputTokens: 10, outputTokens: 5 },
});

beforeEach(() => {
  fake = new FakePramaan({});
  __setCurrentFake(fake);
});

afterEach(() => {
  __setCurrentFake(null);
});

describe("configuration", () => {
  test("configured when a key is set, whatever else is in the environment", () => {
    expect(isAiConfigured({})).toBe(true);
  });

  test("not configured without a key", () => {
    __setCurrentFake(null);
    expect(isAiConfigured()).toBe(false);
  });
});

describe("generateText", () => {
  test("sends messages (never a prompt), the reply budget and the temperature", async () => {
    fake.route({ "llm.complete": () => reply("hello") });

    const result = await generateText({
      system: "be brief",
      prompt: "hi",
      maxOutputTokens: 128,
      temperature: 0,
    });

    expect(result.text).toBe("hello");
    expect(result.finishReason).toBe("stop");
    const request = fake.callsTo("llm.complete")[0] as {
      messages: unknown[];
      maxTokens: number;
      temperature: number;
    };
    expect(request.messages).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
    expect(request.maxTokens).toBe(128);
    expect(request.temperature).toBe(0);
  });

  test("the default reply budget is 256 and it never drops below 64", async () => {
    fake.route({ "llm.complete": () => reply("x") });
    await generateText({ prompt: "a" });
    await generateText({ prompt: "a", maxOutputTokens: 8 });
    const [first, second] = fake.callsTo("llm.complete") as [{ maxTokens: number }, { maxTokens: number }];
    expect(first.maxTokens).toBe(256);
    expect(second.maxTokens).toBe(64);
  });

  test("an unavailable surface reaches the caller once — no blind retry", async () => {
    fake.route({
      "llm.complete": () => {
        throw new PramaanError("upstream_unavailable", "not served yet");
      },
    });

    await expect(generateText({ prompt: "a" })).rejects.toMatchObject({ code: "upstream_unavailable" });
    expect(fake.callsTo("llm.complete")).toHaveLength(1);
  });

  test("a cut-off reply is never returned as complete", async () => {
    fake.route({ "llm.complete": () => reply("partial", "length") });
    await expect(generateText({ prompt: "a" })).rejects.toMatchObject({ code: "incomplete_reply" });
  });

  test("a missing key fails before any call", async () => {
    __setCurrentFake(null);
    await expect(generateText({ prompt: "a" })).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("generateObject", () => {
  const schema = z.object({ title: z.string() });

  test("returns the parsed object and sends the bounded schema", async () => {
    fake.route({ "llm.complete": () => reply(JSON.stringify({ title: "Hello" })) });

    const result = await generateObject({ prompt: "give a title", schema });

    expect(result.object).toEqual({ title: "Hello" });
    const request = fake.callsTo("llm.complete")[0] as { jsonSchema: Record<string, unknown> };
    expect(request.jsonSchema).toMatchObject({ type: "object", properties: { title: { type: "string" } } });
  });

  test("a reply that fails the schema raises the typed invalid-reply error", async () => {
    fake.route({ "llm.complete": () => reply(JSON.stringify({ title: 42 })) });
    await expect(generateObject({ prompt: "a", schema })).rejects.toBeInstanceOf(AIInvalidReplyError);
  });

  test("a cut-off structured reply raises the output-token-limit error", async () => {
    fake.route({ "llm.complete": () => reply('{"title": "cut', "length") });
    await expect(generateObject({ prompt: "a", schema })).rejects.toBeInstanceOf(AIOutputTokenLimitError);
  });
});

describe("streamObject", () => {
  const schema = z.object({ title: z.string() });

  test("emits parseable snapshots and resolves the validated object", async () => {
    fake.routeStream(async function* () {
      await Promise.resolve();
      yield { type: "text_delta" as const, text: '{"title":' };
      yield { type: "text_delta" as const, text: '"Hi"}' };
      yield {
        type: "done" as const,
        result: { text: '{"title":"Hi"}', finishReason: "stop", usage: { inputTokens: 3, outputTokens: 2 } },
      };
    });

    const result = streamObject({ prompt: "a", schema });
    const snapshots: unknown[] = [];
    for await (const snapshot of result.partialObjectStream) snapshots.push(snapshot);
    const object = await result.completion;

    expect(object).toEqual({ title: "Hi" });
    expect(snapshots.at(-1)).toEqual({ title: "Hi" });
  });

  test("accepts a complete JSON reply when the service returns no text chunks", async () => {
    fake.routeStream(async function* () {
      await Promise.resolve();
      yield { type: "done" as const, result: reply('{"title":"Feedback"}') };
    });
    const result = streamObject({ prompt: "one feedback question", schema });
    const snapshots: unknown[] = [];
    for await (const snapshot of result.partialObjectStream) snapshots.push(snapshot);
    await expect(result.completion).resolves.toEqual({ title: "Feedback" });
    expect(snapshots.at(-1)).toEqual({ title: "Feedback" });
    expect(fake.streamCalls).toHaveLength(1);
  });

  test("a complete-response fallback still refuses a reply cut off by the token limit", async () => {
    fake.routeStream(async function* () {
      await Promise.resolve();
      yield { type: "done" as const, result: reply('{"title":"cut', "length") };
    });
    const result = streamObject({ prompt: "one feedback question", schema });
    const snapshots: unknown[] = [];
    for await (const snapshot of result.partialObjectStream) snapshots.push(snapshot);
    expect(snapshots).toEqual([]);
    await expect(result.completion).rejects.toBeInstanceOf(AIOutputTokenLimitError);
  });

  test("the completion rejects with the output-token-limit error when the reply is cut off", async () => {
    fake.routeStream(async function* () {
      await Promise.resolve();
      yield { type: "text_delta" as const, text: '{"title": "cut' };
      yield { type: "done" as const, result: { text: '{"title": "cut', finishReason: "length" } };
    });

    const result = streamObject({ prompt: "a", schema });
    await expect(result.completion).rejects.toBeInstanceOf(AIOutputTokenLimitError);
  });

  test("the caller's abort signal ends the stream without a completion", async () => {
    const controller = new AbortController();
    fake.routeStream(async function* () {
      await Promise.resolve();
      yield { type: "text_delta" as const, text: '{"title":' };
      controller.abort();
      yield { type: "text_delta" as const, text: '"Hi"}' };
    });

    const result = streamObject({ prompt: "a", schema, abortSignal: controller.signal });
    for await (const _snapshot of result.partialObjectStream) {
      break;
    }
    await expect(result.completion).rejects.toBeInstanceOf(Error);
  });
});

describe("classifyAIProviderError", () => {
  test("a rate limit is quota exhaustion with the platform's retry hint", () => {
    const error = new PramaanError("rate_limited", "rate limited", {
      retryable: true,
      retryAfterMs: 2500,
      status: 429,
    });
    expect(classifyAIProviderError(error)).toMatchObject({
      isQuotaExhausted: true,
      isRetryable: true,
      statusCode: 429,
      retryAfterSeconds: 3,
    });
  });

  test("an unavailable surface is not retryable", () => {
    const error = new PramaanError("upstream_unavailable", "nope", { status: 502 });
    expect(classifyAIProviderError(error)).toMatchObject({ isRetryable: false, statusCode: 502 });
  });

  test("a rejected key is an auth failure", () => {
    const error = new PramaanError("unauthorized", "bad key", { status: 401 });
    expect(classifyAIProviderError(error)).toMatchObject({ isAuthFailure: true });
  });

  test("a non-platform error is not classified", () => {
    expect(classifyAIProviderError(new Error("domestic"))).toBeUndefined();
    expect(classifyAIProviderError(new AIConfigurationError("providerNotConfigured", "x"))).toBeUndefined();
  });
});

describe("AIConfigurationError", () => {
  test("carries its code and details", () => {
    const error = new AIConfigurationError("providerNotConfigured", "not configured", {
      missingFields: ["PRAMAAN_API_KEY"],
    });
    expect(error.code).toBe("providerNotConfigured");
    expect(error.details.missingFields).toEqual(["PRAMAAN_API_KEY"]);
    expect(error).toBeInstanceOf(Error);
  });
});
