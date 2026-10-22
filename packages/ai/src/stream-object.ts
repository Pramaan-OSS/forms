import { IncompleteGeneration } from "@forms/pramaan";
import { AIInvalidReplyError, AIOutputTokenLimitError } from "./errors";
import { toGenerationSchema } from "./object";
import { aiClient } from "./provider";
import { beginGenerationRun } from "./run";
import { buildMessages, resolveMaxOutputTokens } from "./text";
import type { DeepPartial, TStreamObjectOptions, TStreamObjectResult } from "./types";

/**
 * Streaming counterpart to `generateObject`: the structured reply arrives as text, so
 * snapshots are the best-effort parse of the text written so far and the final object is
 * the schema-validated parse of the whole reply. One platform call feeds both.
 *
 * Synchronous on purpose: returning before the platform call opens is what lets a caller
 * attach to `completion` without having missed a synchronous failure.
 */
export const streamObject = <T = unknown>(options: TStreamObjectOptions<T>): TStreamObjectResult<T> => {
  const {
    schema,
    schemaName: _schemaName,
    schemaDescription: _schemaDescription,
    onError,
    ...textOptions
  } = options;

  const run = beginGenerationRun(textOptions);

  let finished = false;
  const buffer: DeepPartial<T>[] = [];
  let wake: (() => void) | null = null;
  const flushWake = () => {
    const pending: (() => void) | null = wake;
    wake = null;
    if (pending) pending();
  };
  const push = (snapshot: DeepPartial<T>) => {
    buffer.push(snapshot);
    flushWake();
  };

  const completion = (async (): Promise<T> => {
    try {
      const events = aiClient().llmChatStream(
        {
          messages: buildMessages(options),
          maxTokens: resolveMaxOutputTokens(options.maxOutputTokens),
          ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
          jsonSchema: toGenerationSchema(schema),
        },
        { signal: run.signal }
      );

      let text = "";
      let usage = { inputTokens: 0, outputTokens: 0 };
      for await (const event of events) {
        if (event.type === "text_delta") {
          text += event.text;
          const snapshot = snapshotOf(text);
          if (snapshot !== undefined) push(snapshot as DeepPartial<T>);
        }
        if (event.type === "usage") {
          usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
        }
      }

      const parsed = schema.safeParse(safeJsonParse(text));
      if (!parsed.success) {
        throw new AIInvalidReplyError("The reply does not satisfy the requested structure.", usage);
      }
      return parsed.data;
    } catch (error) {
      // A cut-off structured reply is incomplete, never a partial success.
      if (error instanceof IncompleteGeneration) {
        throw run.translate(new AIOutputTokenLimitError({ maxOutputTokens: options.maxOutputTokens }));
      }
      throw run.translate(error);
    } finally {
      finished = true;
      flushWake();
      run.dispose();
    }
  })();

  // A caller may legitimately never await this — the client aborted, so only the partial
  // stream was ever consumed. Route the rejection to `onError` (as the transport contract
  // expects) and keep it from surfacing as an unhandled one.
  completion.catch((error) => {
    void onError?.({ error });
  });

  async function* partialObjectStream(): AsyncGenerator<DeepPartial<T>> {
    for (;;) {
      while (buffer.length > 0) yield buffer.shift() as DeepPartial<T>;
      if (finished) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  return { partialObjectStream: partialObjectStream(), completion };
};

/** The object as far as it parses, or `undefined` while nothing valid can be closed yet. */
const snapshotOf = (raw: string): unknown => {
  const attempt = closeOpenJson(raw);
  if (attempt === null) return undefined;
  try {
    return JSON.parse(attempt);
  } catch {
    return undefined;
  }
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Tolerate a half-written trailing string or number by closing what is open; `null` when unrepairable. */
function closeOpenJson(raw: string): string | null {
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // keep going
  }
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inString) {
    if (escaped) return null;
    raw += '"';
  }
  let candidate = raw + stack.reverse().join("");
  for (;;) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      const trimmed = candidate.replace(/,\s*[\w.+-]*$/, "");
      if (trimmed === candidate) return null;
      candidate = trimmed + [...stack].reverse().join("");
    }
  }
}
