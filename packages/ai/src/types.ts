import type { z } from "zod";

export interface TAIGenerationUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface TAIGenerationMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface TGenerateTextOptions {
  /** One system message, prepended before `messages`. */
  readonly system?: string;
  /** Shorthand for a single user message. */
  readonly prompt?: string;
  /** The chat so far, oldest first. */
  readonly messages?: ReadonlyArray<TAIGenerationMessage>;
  /**
   * The model's output budget in tokens. The reply limit the platform enforces:
   * 256 by default, never below 64.
   */
  readonly maxOutputTokens?: number;
  /** Randomness from 0 (steady) to 2 (varied). */
  readonly temperature?: number;
  /** Milliseconds; the call is aborted and a `TimeoutError` raised when it passes. */
  readonly timeout?: number;
  /** Aborts the in-flight call when it fires. */
  readonly abortSignal?: AbortSignal;
  /**
   * Accepted for call-site compatibility. Retry policy belongs to the Pramaan
   * client: a rate-limited call waits as the server asks, and an unavailable
   * surface is never retried blind.
   */
  readonly maxRetries?: number;
}

export interface TGenerateTextResult {
  readonly text: string;
  readonly finishReason: "stop" | "length" | "other";
  readonly usage: TAIGenerationUsage;
}

export interface TGenerateObjectOptions<T = unknown> extends TGenerateTextOptions {
  /** The zod schema the reply must satisfy; sent to the model as its bounded JSON Schema form. */
  readonly schema: z.ZodType<T>;
  readonly schemaName?: string;
  readonly schemaDescription?: string;
}

export interface TGenerateObjectResult<T = unknown> {
  readonly object: T;
  readonly finishReason: TGenerateTextResult["finishReason"];
  readonly usage: TAIGenerationUsage;
}

export interface TStreamObjectOptions<T = unknown> extends TGenerateObjectOptions<T> {
  /** Observes a transport failure mid-stream; the completion still rejects with it. */
  readonly onError?: (event: { error: unknown }) => Promise<void> | void;
}

/**
 * Best-effort whole-object snapshots as the model writes. A snapshot is emitted
 * only when the partial JSON parses, so a snapshot can lag the text by a token
 * but is never malformed. Read the final object from `completion`.
 */
export interface TStreamObjectResult<T = unknown> {
  readonly partialObjectStream: AsyncIterable<DeepPartial<T>>;
  /**
   * Resolves to the parsed, schema-validated object once the generation finishes.
   * Rejects with `AIOutputTokenLimitError` when the reply was cut off by the limit,
   * with `AIInvalidReplyError` when the finished text does not satisfy the schema,
   * with the transport error on a failure, and with the abort reason when the
   * caller's signal or the `timeout` fired.
   */
  readonly completion: Promise<T>;
}

/** Matches the consumer-facing shape of a partially written object. */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
