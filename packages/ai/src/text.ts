import { prepareGenerationRequest } from "@forms/pramaan";
import type { Caps } from "@forms/pramaan";
import { aiClient } from "./provider";
import { runGeneration } from "./run";
import type { TAIGenerationMessage, TGenerateTextOptions, TGenerateTextResult } from "./types";

const DEFAULT_MAX_OUTPUT_TOKENS = 256;
const MIN_MAX_OUTPUT_TOKENS = 64;

/** The reply budget the platform enforces: 256 by default, never below 64. */
export const resolveMaxOutputTokens = (maxOutputTokens?: number): number =>
  Math.max(MIN_MAX_OUTPUT_TOKENS, maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS);

/** The platform's optional-field reply, normalized to what callers read. */
export const normalizeReply = (reply: Caps.LlmResult): TGenerateTextResult => ({
  text: reply.text ?? "",
  finishReason:
    reply.finishReason === "stop" || reply.finishReason === "length" ? reply.finishReason : "other",
  usage: {
    inputTokens: reply.usage?.inputTokens ?? 0,
    outputTokens: reply.usage?.outputTokens ?? 0,
  },
});

/** The chat for one call: the system message first, then the caller's messages, then the prompt. */
export const buildMessages = (options: TGenerateTextOptions): TAIGenerationMessage[] => {
  const messages: TAIGenerationMessage[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  if (options.messages) messages.push(...options.messages);
  if (options.prompt) messages.push({ role: "user", content: options.prompt });
  return messages;
};

export const generateText = async (options: TGenerateTextOptions): Promise<TGenerateTextResult> => {
  const messages = buildMessages(options);
  if (messages.length === 0) {
    throw new Error("Generation requires a prompt, messages, or a system message.");
  }

  const request = prepareGenerationRequest({
    messages,
    maxTokens: resolveMaxOutputTokens(options.maxOutputTokens),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
  });

  return runGeneration(options, (signal) => aiClient().llmComplete(request, { signal }).then(normalizeReply));
};
