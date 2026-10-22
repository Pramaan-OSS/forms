import { AIInvalidReplyError } from "@forms/ai";
import { PramaanError } from "@forms/pramaan";

/**
 * Real generation errors, built the way the client and package build them, with user content
 * planted in every place they put it: the message, a cause chain, and the invalid reply's reason.
 * Every planted string contains `PLANTED_USER_CONTENT`, so a test asserts that a sink received
 * none of it with `findPlantedContent`.
 */
export const PLANTED_USER_CONTENT = "planted-user-content-eng-3720";

const planted = (where: string) => `${PLANTED_USER_CONTENT}:${where}`;

export const buildPlatformCallError = (statusCode = 500): PramaanError =>
  new PramaanError("internal", "The platform refused the call.", { status: statusCode });

/** A reply that arrived but failed its schema: the model's output on the cause. */
export const buildInvalidReplyError = (): AIInvalidReplyError => {
  const error = new AIInvalidReplyError(`Reply rejected: ${planted("reply-reason")}`, {
    inputTokens: 10,
    outputTokens: 20,
  });
  error.cause = new Error(planted("model-output-value"));
  return error;
};

/** The platform's answer to a rejected key: a fixed message, no call content. */
export const buildRejectedKeyError = (): PramaanError =>
  new PramaanError("unauthorized", "bad key", { status: 401 });

/** An app error wrapping an invalid reply, the way a service layer rethrows one. */
export const buildWrappedPlatformError = (): Error =>
  new Error(`Wrapped: ${planted("wrapper-message")}`, { cause: buildInvalidReplyError() });

/** Every shape above, named for `test.each`. */
export const LEAKY_AI_ERRORS: ReadonlyArray<readonly [string, () => Error]> = [
  ["an invalid-reply error", buildInvalidReplyError],
  ["an app error wrapping an invalid reply", buildWrappedPlatformError],
];

/**
 * The path of the first string under `value` that contains planted content, or undefined. Walks every own
 * property — non-enumerable ones too — and an Error's `name`, `message`, `stack` and `cause` wherever they
 * live, through arrays, plain objects and errors. A sink can only print what is reachable this way, so a clean result
 * holds for pino's serializer, error reporting and anything else that reads the value.
 */
export const findPlantedContent = (
  value: unknown,
  path = "$",
  seen: WeakSet<object> = new WeakSet()
): string | undefined => {
  if (typeof value === "string") {
    return value.includes(PLANTED_USER_CONTENT) ? path : undefined;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  // An error's name, message and stack can live on its prototype chain depending on the runtime; a
  // sink reads them either way, so they are searched either way.
  const errorKeys = value instanceof Error ? ["name", "message", "stack", "cause"] : [];
  for (const key of new Set<PropertyKey>([...Reflect.ownKeys(value), ...errorKeys])) {
    const found = findPlantedContent(
      (value as Record<PropertyKey, unknown>)[key],
      `${path}.${String(key)}`,
      seen
    );
    if (found) return found;
  }
  return undefined;
};
