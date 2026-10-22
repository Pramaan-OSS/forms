import type { TGenerateTextOptions, TGenerateTextResult } from "./types";

export type GenerationCall = (signal: AbortSignal) => Promise<TGenerateTextResult>;

export class TimeoutError extends Error {
  constructor() {
    super("The generation did not finish in time.");
    this.name = "TimeoutError";
  }
}

export interface GenerationRun {
  readonly signal: AbortSignal;
  /** Settle the controller: runs when the call (or the stream) is done. */
  readonly dispose: () => void;
  /** Map an abort from this controller onto the error the caller should see. */
  readonly translate: (error: unknown) => unknown;
}

/**
 * The abort wiring one generation shares, blocking or streamed: the caller's
 * signal and the call's own time limit folded into a single controller.
 *
 * - The caller's signal firing aborts the in-flight request; the transport's
 *   rejection travels unchanged (the caller checks its own `signal.aborted`).
 * - `timeout` expiring aborts the call and surfaces as a `TimeoutError`, so a
 *   caller with its own retry policy can tell the two apart.
 */
export const beginGenerationRun = (
  options: Pick<TGenerateTextOptions, "abortSignal" | "timeout">
): GenerationRun => {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];

  if (options.abortSignal) {
    const caller = options.abortSignal;
    if (caller.aborted) {
      controller.abort(caller.reason);
    } else {
      const forward = () => controller.abort(caller.reason);
      caller.addEventListener("abort", forward, { once: true });
      cleanups.push(() => caller.removeEventListener("abort", forward));
    }
  }

  let timedOut = false;
  if (typeof options.timeout === "number" && options.timeout > 0) {
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new TimeoutError());
    }, options.timeout);
    cleanups.push(() => clearTimeout(timer));
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const cleanup of cleanups) cleanup();
    },
    translate: (error: unknown) => {
      if (timedOut && !options.abortSignal?.aborted) return new TimeoutError();
      return error;
    },
  };
};

/** One blocking generation call with the caller's abort signal and its time limit applied. */
export const runGeneration = async (
  options: Pick<TGenerateTextOptions, "abortSignal" | "timeout">,
  call: GenerationCall
): Promise<TGenerateTextResult> => {
  const run = beginGenerationRun(options);
  try {
    return await call(run.signal);
  } catch (error) {
    throw run.translate(error);
  } finally {
    run.dispose();
  }
};
