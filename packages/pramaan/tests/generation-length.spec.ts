import { expect, test } from "vitest";
import { FakePramaan } from "../src/fake";
import { Cap, IncompleteGeneration, Pramaan, PramaanClient, PramaanError } from "../src/index";

const input = {
  messages: [{ role: "user" as const, content: "Summarise these survey answers." }],
  maxTokens: 1024,
};
test("whole free-text, structured and tool replies fail explicitly on truncation", async () => {
  const fake = new FakePramaan({
    [Cap.llmComplete]: () => ({ text: '{"summary":', finishReason: "length" }),
    [Cap.llmChat]: () => ({ toolCalls: [{ arguments: '{"start":' }], finishReason: "length" }),
  });
  for (const fields of [{}, { jsonSchema: { type: "object", properties: {} } }]) {
    await expect(fake.llmComplete({ ...input, ...fields })).rejects.toBeInstanceOf(IncompleteGeneration);
  }
  await expect(
    fake.llmChat({ ...input, tools: [{ name: "save", parameters: { type: "object", properties: {} } }] })
  ).rejects.toThrow("incomplete");
  expect(fake.calls).toHaveLength(3);
});
test("streamed partial text and tool inputs are held until a complete terminal reply", async () => {
  const fake = new FakePramaan();
  fake.routeStream(async function* () {
    yield { type: "text_delta", text: '{"summary":' };
    yield { type: "tool_call_start", index: 0, id: "call-1", name: "save" };
    yield { type: "tool_call_delta", index: 0, arguments: '{"start":' };
    yield { type: "tool_call_end", index: 0 };
    yield { type: "done", result: {}, finishReason: "length" };
  });
  const received: unknown[] = [];
  await expect(
    (async () => {
      for await (const event of fake.llmChatStream(input)) received.push(event);
    })()
  ).rejects.toThrow("incomplete");
  expect(received).toEqual([]);
  expect(fake.streamCalls).toHaveLength(1);
});
test("new final maxTokens refusal is a configuration error, with no retry", async () => {
  const fake = new FakePramaan({
    [Cap.llmComplete]: () => {
      throw new PramaanError("invalid_request", "maxTokens reached", { status: 400 });
    },
  });
  fake.routeStream(async function* () {
    throw new PramaanError("invalid_request", "maxTokens reached", { status: 400 });
  });
  await expect(fake.llmComplete(input)).rejects.toThrow("administrator");
  await expect(
    (async () => {
      for await (const _event of fake.llmChatStream(input)) {
      }
    })()
  ).rejects.toThrow("administrator");
  expect(fake.calls).toHaveLength(1);
  expect(fake.streamCalls).toHaveLength(1);
});
test("real boundary catches charged length and maxTokens 400 without another request", async () => {
  for (const [status, body, message] of [
    [200, { text: "Partial", finishReason: "length" }, "incomplete"],
    [400, { error: { code: "invalid_request", message: "maxTokens reached" } }, "administrator"],
  ] as const) {
    let requests = 0;
    const client = new Pramaan(
      new PramaanClient({
        apiKey: "fake",
        fetch: async () => {
          requests++;
          return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        },
      })
    );
    await expect(client.llmComplete(input)).rejects.toThrow(message);
    expect(requests).toBe(1);
  }
});
