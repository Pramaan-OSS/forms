import { IncompleteGeneration, normalizeJsonSchema } from "@forms/pramaan";
import { z } from "zod";
import { AIInvalidReplyError, AIOutputTokenLimitError } from "./errors";
import { aiClient } from "./provider";
import { runGeneration } from "./run";
import { buildMessages, normalizeReply, resolveMaxOutputTokens } from "./text";
import type { TGenerateObjectOptions, TGenerateObjectResult, TGenerateTextResult } from "./types";

/** The bounded JSON Schema form of the caller's zod schema, as the platform defines it. */
export const toGenerationSchema = <T>(schema: z.ZodType<T>): Record<string, unknown> =>
  normalizeJsonSchema(z.toJSONSchema(schema, { io: "input" }), "Response");

const parseReplyObject = <T>(text: string, schema: z.ZodType<T>, usage: TGenerateTextResult["usage"]): T => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AIInvalidReplyError("The reply is not valid JSON.", usage);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AIInvalidReplyError("The reply does not satisfy the requested structure.", usage);
  }
  return result.data;
};

export const generateObject = async <T = unknown>(
  options: TGenerateObjectOptions<T>
): Promise<TGenerateObjectResult<T>> => {
  const { schema, schemaName: _schemaName, schemaDescription: _schemaDescription, ...textOptions } = options;

  const result = await runGeneration(textOptions, (signal) =>
    aiClient()
      .llmComplete(
        {
          messages: buildMessages(options),
          maxTokens: resolveMaxOutputTokens(options.maxOutputTokens),
          ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
          jsonSchema: toGenerationSchema(schema),
        },
        { signal }
      )
      .then(normalizeReply)
      .catch((error) => {
        // The client refuses a cut-off reply outright; a structured answer that hit
        // the limit is incomplete, never a partial success.
        if (error instanceof IncompleteGeneration) {
          throw new AIOutputTokenLimitError({ maxOutputTokens: options.maxOutputTokens });
        }
        throw error;
      })
  );

  const object = parseReplyObject(result.text, schema, result.usage);

  return {
    object,
    finishReason: result.finishReason,
    usage: result.usage,
  };
};
