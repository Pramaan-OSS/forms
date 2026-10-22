import { describe, expect, test } from "vitest";
import { CATALOG } from "../src/catalog";
import { FakePramaan } from "../src/fake";
import {
  Cap,
  MISSING_KEY_MESSAGE,
  MissingPramaanKey,
  NOT_AVAILABLE,
  Pramaan,
  PramaanClient,
  isUnavailable,
  prepareGenerationRequest,
  unavailableMessage,
} from "../src/index";
import { assertBoundedJsonSchema, validateGenerationSchemas } from "../src/json-schema";
import { ALL_SCHEMAS, ALL_TOOLS } from "../src/schemas";
import { PramaanError } from "../src/sdk/errors";

const MODERATION_OK = {
  type: "object",
  properties: { allowed: { type: "boolean" } },
  required: ["allowed"],
  additionalProperties: false,
};

describe("bounded schemas", () => {
  test("every real schema fits the bounded subset", () => {
    for (const schema of ALL_SCHEMAS) assertBoundedJsonSchema(schema, "test");
    for (const tool of ALL_TOOLS) assertBoundedJsonSchema(tool.parameters, `Tool ${tool.name}`);
    validateGenerationSchemas({ tools: ALL_TOOLS, jsonSchema: MODERATION_OK });
  });

  test("a schema outside the subset is refused locally", () => {
    expect(() =>
      assertBoundedJsonSchema({
        type: "object",
        properties: { a: { type: "string", format: "email" } },
      })
    ).toThrow();
    expect(() =>
      assertBoundedJsonSchema({
        type: "object",
        properties: { a: { type: "string", pattern: "^x" } },
      })
    ).toThrow();
    expect(() => assertBoundedJsonSchema("not a schema")).toThrow();
  });

  test("every catalog id is in Cap", () => {
    const capValues = new Set<string>(Object.values(Cap));
    for (const id of Object.keys(CATALOG)) expect(capValues.has(id)).toBe(true);
  });
});

describe("FakePramaan", () => {
  test("routes calls, records them, and validates generation schemas", async () => {
    const fake = new FakePramaan({
      [Cap.emailSend]: async () => ({ ref: "e1" }),
      [Cap.textLanguageDetect]: async () => ({ language: "en", confidence: 0.98 }),
    });
    const sent = await fake.emailSend(
      { from: "sender@example.test", to: ["a@example.com"], subject: "Hi" },
      { idempotencyKey: "test-email" }
    );
    expect((sent as { ref: string }).ref).toBe("e1");
    expect(fake.callsTo(Cap.emailSend)).toHaveLength(1);
    await expect(
      fake.call(Cap.storageObjectPut, { bucket: "fixture", path: "x.txt" }, { idempotencyKey: "test-upload" })
    ).rejects.toThrow("no route");
    const detected = await fake.call(Cap.textLanguageDetect, { text: "Hello there" });
    expect((detected as { language: string }).language).toBe("en");
  });
});

describe("unavailable surfaces", () => {
  test("render one plain sentence, never the raw error", () => {
    expect(unavailableMessage(new PramaanError("upstream_unavailable", "x"))).toBe(NOT_AVAILABLE);
    expect(isUnavailable(new PramaanError("not_found", "x"))).toBe(true);
    expect(unavailableMessage(new Error("raw vendor detail"))).toBe(
      "Could not confirm the result. Check its status before trying again."
    );
  });
});

describe("generation boundary", () => {
  const input = { messages: [{ role: "user", content: "Summarise this response." }] };
  test("sends the cleaned schema and a bounded default", async () => {
    let sent: any;
    const client = new Pramaan(
      new PramaanClient({
        apiKey: "fake",
        fetch: async (_url, options) => {
          sent = JSON.parse(String(options?.body));
          return new Response(JSON.stringify({ text: "Ready" }), { status: 200 });
        },
      })
    );
    await client.call(Cap.llmComplete, {
      ...input,
      jsonSchema: {
        type: "object",
        $schema: "unused",
        properties: { email: { type: "string", format: "email" } },
      },
    });
    expect(sent.maxTokens).toBe(256);
    expect(sent.jsonSchema).toEqual({ type: "object", properties: { email: { type: "string" } } });
    expect(sent.messages).toEqual(input.messages);
  });
  test("refuses unsupported keywords with their tool and path", () => {
    for (const keyword of ["pattern", "oneOf", "allOf"]) {
      expect(() =>
        prepareGenerationRequest({
          ...input,
          tools: [
            {
              name: "saveInsight",
              parameters: {
                type: "object",
                properties: { title: { type: "string", [keyword]: keyword === "pattern" ? "x" : [] } },
              },
            },
          ],
        })
      ).toThrow("saveInsight");
      expect(() =>
        prepareGenerationRequest({
          ...input,
          jsonSchema: { type: "object", properties: { title: { type: "string", [keyword]: [] } } },
        })
      ).toThrow("title");
    }
  });
  test("fake refuses prompt, small budgets and unclean schemas", async () => {
    const fake = new FakePramaan({ [Cap.llmComplete]: () => ({ text: "ok" }) });
    for (const request of [
      { prompt: "x", maxTokens: 64 },
      { ...input, maxTokens: 8 },
      { ...input, maxTokens: 64, jsonSchema: { type: "object", $schema: "unused" } },
    ])
      await expect(fake.call(Cap.llmComplete, request)).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });
  test("honours explicit waits twice and never retries unavailable starts", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const client = new Pramaan(
      new PramaanClient({
        apiKey: "fake",
        fetch: async () => {
          attempts++;
          return new Response(
            JSON.stringify({ error: { code: "rate_limited", message: "Try later", retryable: true } }),
            { status: 429, headers: { "Retry-After": "1" } }
          );
        },
      }),
      async (ms) => {
        waits.push(ms);
      }
    );
    await expect(client.call(Cap.llmChat, input)).rejects.toThrow();
    expect(attempts).toBe(3);
    expect(waits).toEqual([1000, 1000]);
    attempts = 0;
    const unavailable = new Pramaan(
      new PramaanClient({
        apiKey: "fake",
        fetch: async () => {
          attempts++;
          return new Response(
            JSON.stringify({
              error: { code: "upstream_unavailable", message: "Unavailable", retryable: true },
            }),
            { status: 502 }
          );
        },
      })
    );
    await expect(unavailable.call(Cap.llmChat, input)).rejects.toThrow();
    expect(attempts).toBe(1);
  });
  test("missing configuration has one safe message and a client status", () => {
    const error = new MissingPramaanKey();
    expect(error.status).toBe(422);
    expect(unavailableMessage(error)).toBe(MISSING_KEY_MESSAGE);
  });
});
