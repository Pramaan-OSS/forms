import { PramaanError } from "./sdk/errors";
import type { LlmChatStreamEvent } from "./sdk/types";

export class IncompleteGeneration extends Error {
  readonly code = "incomplete_reply";
  readonly retryable = true;
  readonly partialText: string;
  constructor(text = "") {
    super(
      "The reply is incomplete because it reached the reply limit. Retry this step manually with a larger reply limit."
    );
    this.partialText = text;
  }
}
export function completeGeneration<T>(result: T): T {
  const reply = result as { finishReason?: string; text?: string } | null;
  if (reply?.finishReason === "length") throw new IncompleteGeneration(reply.text);
  return result;
}
export function generationError(error: unknown): unknown {
  if (error instanceof PramaanError && error.code === "invalid_request" && /maxTokens/i.test(error.message))
    return new PramaanError(
      "invalid_request",
      "The reply limit is too small to produce an answer. Ask your administrator to increase the reply limit before retrying.",
      { status: 400, retryable: false }
    );
  return error;
}
/** Hold text and tool inputs until the terminal event confirms completion. */
export async function* completeGenerationStream(
  events: AsyncGenerator<LlmChatStreamEvent>
): AsyncGenerator<LlmChatStreamEvent> {
  const pending: LlmChatStreamEvent[] = [];
  try {
    for await (const event of events) {
      pending.push(event);
      if (event.type === "done") {
        completeGeneration({
          ...(event.result as object),
          finishReason: event.finishReason ?? (event.result as { finishReason?: string })?.finishReason,
        });
        const text = (event.result as { text?: unknown } | null)?.text;
        if (typeof text === "string" && text && !pending.some((item) => item.type === "text_delta")) {
          // A complete response or replay can arrive without incremental text events.
          pending.splice(pending.length - 1, 0, { type: "text_delta", text });
        }
        yield* pending;
        return;
      }
    }
    throw new Error("The reply stream ended before completion. Check its status before retrying.");
  } catch (error) {
    throw generationError(error);
  }
}
