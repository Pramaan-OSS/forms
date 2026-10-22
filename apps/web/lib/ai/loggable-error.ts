import { AIInvalidReplyError, classifyAIProviderError } from "@forms/ai";
import { PramaanError } from "@forms/pramaan";
import { type TLoggableError, loggableError, stackFrames } from "@/lib/utils/loggable-error";

/**
 * What a generation failure may put in a log line or an error report. Never a message: a
 * platform error carries the call's context and an invalid-reply error the model's output, and
 * pino's `err` serializer writes all of that, causes and nested errors included, and error
 * reporting shows the message of the error and of every cause.
 */

/** Far enough for any chain the client builds; a cycle stops here. */
const MAX_CAUSE_DEPTH = 5;

/** `describeAIError`'s fields: a name, frames and the platform's enumerated diagnostics. */
export type TAIErrorDescription = TLoggableError & {
  /**
   * The names of the errors under `cause`, outermost first. A cause that is not an `Error` is
   * recorded by its type.
   */
  errCauseNames?: string[];
  lastErrName?: string;
  /** The fixed code of a platform failure on this error or its last cause — never a message. */
  lastErrCode?: string;
};

/** `describeAIError` plus the platform's HTTP status, for logs that do not carry it already. */
export type TLoggableAIError = TAIErrorDescription & { providerStatusCode?: number };

const nameOf = (value: unknown): string => {
  if (!(value instanceof Error)) return typeof value;
  return typeof value.name === "string" ? value.name : typeof value.name;
};

const causeNames = (error: Error): string[] => {
  const names: string[] = [];
  let cause: unknown = error.cause;
  while (cause !== undefined && names.length < MAX_CAUSE_DEPTH) {
    names.push(nameOf(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return names;
};

/**
 * Name, frames, cause names and the platform's enumerated diagnostics of a generation failure —
 * for a log line that records the status under a key of its own.
 */
export const describeAIError = (error: unknown): TAIErrorDescription => {
  if (!(error instanceof Error)) {
    return loggableError(error);
  }

  const causes = causeNames(error);
  const lastCause = causes.at(-1);
  return {
    ...loggableError(error),
    ...(causes.length > 0 ? { errCauseNames: causes } : {}),
    ...(error instanceof PramaanError ? { lastErrCode: error.code } : {}),
    ...(lastCause !== undefined ? { lastErrName: lastCause } : {}),
  };
};

/**
 * The platform's HTTP status for a failure, read from the first link of its `cause` chain that
 * carries one. `classifyAIProviderError` reads only the error it is given, so an app error
 * wrapping a platform error would otherwise report no status at all. Bounded, so a cause cycle
 * stops.
 */
const providerStatusCodeOf = (error: unknown): number | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    const statusCode = classifyAIProviderError(current)?.statusCode;
    if (statusCode !== undefined) return statusCode;
    if (!(current instanceof Error)) return undefined;
    current = current.cause;
  }
  return undefined;
};

/** `describeAIError` plus the platform's HTTP status: everything a generation failure may log. */
export const loggableAIError = (error: unknown): TLoggableAIError => {
  const providerStatusCode = providerStatusCodeOf(error);
  return {
    ...describeAIError(error),
    ...(providerStatusCode === undefined ? {} : { providerStatusCode }),
  };
};

/**
 * Whether an error is one whose message can echo the model's reply — the invalid-reply error and
 * anything wrapping one. The platform's own errors and the token-limit error carry fixed messages,
 * so they pass through and callers still branch on them.
 */
export const isAIFailureChain = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (current instanceof AIInvalidReplyError) {
      return true;
    }
    if (!(current instanceof Error)) return false;
    current = current.cause;
  }
  return false;
};

/**
 * Stands in for a generation error on its way to a sink that logs or reports errors whole — the
 * server action client's `handleServerError` writes a thrown error to pino and to error reporting
 * as it is. It keeps what locates the failure — the original name (or, for something thrown that
 * is not an `Error`, its type), the platform status found anywhere down the `cause` chain, and
 * the original frames under a header of its own — and nothing the call filled in: no message, no
 * fields, no `cause`.
 */
export class RedactedAIError extends Error {
  readonly originalName: string;
  readonly providerStatusCode?: number;

  constructor(original: unknown) {
    const originalName = nameOf(original);
    const providerStatusCode = providerStatusCodeOf(original);
    super(
      `AI call failed with ${originalName}${
        providerStatusCode === undefined ? "" : ` (status ${providerStatusCode})`
      }; its message is withheld because it can carry the prompt or the model's output`
    );
    this.name = "RedactedAIError";
    this.originalName = originalName;
    if (providerStatusCode !== undefined) {
      this.providerStatusCode = providerStatusCode;
    }

    // The original's frames under this error's own header, so a report still points at the failing
    // call rather than at the line that redacted it. Without readable frames, this error's own
    // stack stands.
    const frames = original instanceof Error ? stackFrames(original) : [];
    if (frames.length > 0) {
      this.stack = [`${this.name}: ${this.message}`, ...frames].join("\n");
    }
  }
}

/**
 * The error to rethrow past code that may log or report it whole. Fails closed: a platform or
 * package error (or an error wrapping one) and anything thrown that is not an `Error` at all
 * become a `RedactedAIError`. Only the app's own `Error`s pass through unchanged: they carry no
 * prompt, and callers still branch on them. Log the original with `loggableAIError` first if it
 * is worth a line of its own; the redacted error cannot be turned back.
 */
export const redactAIError = (error: unknown): unknown =>
  !(error instanceof Error) || isAIFailureChain(error) ? new RedactedAIError(error) : error;
