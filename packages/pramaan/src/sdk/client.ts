import { DEFAULT_BASE_URL, Pramaan as PublishedPramaan } from "@pramaan/sdk";
import type { PramaanOptions } from "@pramaan/sdk";
import { assertActionKey } from "../action-policy";
// Compatibility helpers for product behavior absent from @pramaan/sdk 0.1.0.

import { capabilityInfo } from "../catalog";
import { PramaanError, errorFromResponse } from "./errors";
import type {
  CapabilityInfo,
  Job,
  LlmChatStreamEvent,
  OutcomeRun,
  OutcomeRunOptions,
  OutcomeRunStep,
  RunOptions,
  WaitOptions,
} from "./types";

/**
 * The hosted API's URL: the one place the API domain is set.
 */
export { PRAMAAN_API_URL, DEFAULT_BASE_URL } from "@pramaan/sdk";

export const MIN_POLL_MS = 2_000;
const MAX_POLL_MS = 30_000;
const DEFAULT_WAIT_MS = 31 * 60_000;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8_000;

export type { PramaanOptions } from "@pramaan/sdk";

interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new PramaanError("internal", "The API returned a response that is not JSON.", {
      requestId: response.headers.get("x-request-id") ?? undefined,
      status: response.status,
    });
  }
}

export class PramaanClient {
  readonly #sdkOptions: PramaanOptions;
  // Scope response metadata to one operation, including concurrent requests.
  async #usingSdk<T>(
    operation: (client: InstanceType<typeof PublishedPramaan>) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    let lastError: PramaanError | undefined;
    const client = new PublishedPramaan({
      ...this.#sdkOptions,
      // This product never repeats a start after an uncertain reply.
      maxRetries: 0,
      fetch: async (url, init) => {
        const method = init.method ?? "GET";
        const path = new URL(url).pathname;
        const retry = method === "GET" || path.endsWith("/estimate");
        for (let attempt = 0; ; attempt++) {
          try {
            const response = await this.#fetch(url, { ...init, ...(signal ? { signal } : {}) });
            if (response.ok) {
              lastError = undefined;
              return response;
            }
            const previous = lastError;
            lastError = await errorFromResponse(response.clone());
            if (previous && lastError.code === "conflict" && lastError.retryable) {
              lastError = previous;
              return response;
            }
            if (
              !retry ||
              !lastError.retryable ||
              (response.status !== 429 && response.status < 500) ||
              attempt >= this.#maxRetries
            )
              return response;
          } catch (error) {
            if (!retry || attempt >= this.#maxRetries) throw error;
          }
          await this.#sleep(lastError?.retryAfterMs ?? Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS));
        }
      },
    });
    try {
      return await operation(client);
    } catch (error) {
      throw lastError ?? error;
    }
  }

  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #maxRetries: number;
  readonly #fetch: (input: string, init: RequestInit) => Promise<Response>;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: PramaanOptions) {
    if (!options?.apiKey) {
      throw new PramaanError("unauthorized", "Pass apiKey to new PramaanClient().");
    }
    this.#sdkOptions = options;
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#maxRetries = options.maxRetries ?? 2;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Sync capability: its result. Async capability: a running Job (see `jobs.wait`). */
  async run(id: string, input: unknown, opts: RunOptions = {}): Promise<unknown> {
    assertActionKey(id, opts.idempotencyKey);
    return this.#usingSdk((client) => client.run(id, input, opts), opts.signal);
  }

  async call(id: string, input: unknown, opts: RunOptions = {}): Promise<unknown> {
    assertActionKey(id, opts.idempotencyKey);
    return this.#usingSdk((client) => client.call(id, input, opts), opts.signal);
  }

  /** Traits of one capability, from this product's mini-catalog. Sync and offline. */
  info(id: string): CapabilityInfo | undefined {
    return capabilityInfo(id);
  }

  readonly accounts = {
    list: async (): Promise<{ results: { id: string; family: string; origin: string; status: string }[] }> =>
      (await this.#request("GET", "/v1/accounts", { retry: true })).body as any,
  };

  readonly jobs = {
    get: (id: string): Promise<Job> => this.#usingSdk((client) => client.jobs.get(id)),
    cancel: (id: string): Promise<Job> => this.#usingSdk((client) => client.jobs.cancel(id)),

    /**
     * Polls until the job is no longer running (every 2 s or more, growing 1.5x to 30 s) and
     * returns it, whatever the final status. Throws `upstream_timeout` when `timeoutMs` passes.
     */
    wait: async (id: string, options: WaitOptions = {}): Promise<Job> => {
      const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_WAIT_MS);
      let interval = Math.max(MIN_POLL_MS, options.intervalMs ?? MIN_POLL_MS);
      for (;;) {
        if (options.signal?.aborted) return this.jobs.cancel(id);
        const job = await this.jobs.get(id);
        if (job.status !== "running") return job;
        if (Date.now() + interval > deadline) {
          throw new PramaanError("upstream_timeout", "The job is still running after timeoutMs.", {
            retryable: false,
            jobId: id,
          });
        }
        if (options.signal) {
          const signal = options.signal;
          let wake: () => void = () => {};
          const aborted = new Promise<void>((resolve) => {
            wake = resolve;
            signal.addEventListener("abort", wake, { once: true });
          });
          try {
            if (!signal.aborted) await Promise.race([this.#sleep(interval), aborted]);
          } finally {
            signal.removeEventListener("abort", wake);
          }
        } else await this.#sleep(interval);
        interval = Math.min(Math.ceil(interval * 1.5), MAX_POLL_MS);
      }
    },
  };

  readonly capabilities = {
    list: () => this.#usingSdk((client) => client.capabilities.list()),
    get: (id: string) => this.#usingSdk((client) => client.capabilities.get(id)),
    estimate: (id: string, input: unknown, opts: RunOptions = {}) =>
      this.#usingSdk((client) => client.capabilities.estimate(id, input, opts)),
  };

  readonly outcomes = {
    list: () => this.#usingSdk((client) => client.outcomes.list()),
    get: (id: string) => this.#usingSdk((client) => client.outcomes.get(id)),
    estimate: (id: string, input: unknown, opts: OutcomeRunOptions = {}) =>
      this.#usingSdk((client) => client.outcomes.estimate(id, input, opts)),
    start: (id: string, input: unknown, opts: OutcomeRunOptions = {}): Promise<OutcomeRun | Job> =>
      this.#usingSdk((client) => client.outcomes.start(id, input, opts)),
    run: async (id: string, input: unknown, opts: OutcomeRunOptions = {}): Promise<OutcomeRun> => {
      const started = await this.outcomes.start(id, input, opts);
      if (!("id" in started)) return started;
      const jobId = started.id;
      let job: Job;
      try {
        job = await this.jobs.wait(jobId, {
          timeoutMs: 36 * 60_000,
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
      } catch (error) {
        throw new PramaanError(
          error instanceof PramaanError ? error.code : "upstream_unavailable",
          "The accepted research job could not be confirmed. Check its status before retrying.",
          { jobId }
        );
      }
      if (job.result !== undefined) {
        const report = toOutcomeRun(job.result);
        return {
          ...report,
          ...(job.status === "failed" || job.status === "cancelled" ? { status: job.status } : {}),
          ...(!report.error && job.error ? { error: job.error } : {}),
        };
      }
      throw new PramaanError(
        job.error?.code ?? "internal",
        job.error?.message ?? `The run ended with status "${job.status}".`,
        { jobId }
      );
    },
  };

  /**
   * Runs `llm.chat` and yields the reply as it is generated (PRA-10). The last event is
   * `done`, with the same result the plain call returns. A failure, before or during the
   * stream, throws a PramaanError. A capability that does not stream, and a replayed
   * Idempotency-Key, yield one `done`. Never retried: a retry would generate, and
   * charge, a second reply.
   */
  async *llmChatStream(input: unknown, opts: RunOptions = {}): AsyncGenerator<LlmChatStreamEvent> {
    let failure: PramaanError | undefined;
    const client = new PublishedPramaan({
      ...this.#sdkOptions,
      maxRetries: 0,
      fetch: async (url, init) => {
        const response = await this.#fetch(url, { ...init, ...(opts.signal ? { signal: opts.signal } : {}) });
        if (!response.ok) failure = await errorFromResponse(response.clone());
        return response;
      },
    });
    try {
      yield* client.stream("llm.chat", input as never, opts);
    } catch (error) {
      throw failure ?? error;
    }
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    options: {
      body?: unknown;
      idempotencyKey?: string;
      headers?: Record<string, string>;
      retry?: boolean;
    }
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = {
      ...options.headers,
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    // The same key on every attempt, so a retry can never run the call twice.
    if (options.idempotencyKey !== undefined) headers["Idempotency-Key"] = options.idempotencyKey;
    const init: RequestInit = {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    };

    let previous: PramaanError | undefined;
    for (let attempt = 0; ; attempt++) {
      let error: PramaanError;
      let retryAfterMs: number | undefined;
      try {
        const response = await this.#fetch(`${this.#baseUrl}${path}`, init);
        if (response.ok) {
          return { status: response.status, body: await readBody(response) };
        }
        error = await errorFromResponse(response);
        const after = Number(response.headers.get("retry-after"));
        if (Number.isFinite(after) && after > 0) retryAfterMs = after * 1000;
      } catch (thrown) {
        if (thrown instanceof PramaanError) throw thrown;
        error = new PramaanError("upstream_unavailable", "Could not reach the Pramaan API.", {
          retryable: true,
        });
      }
      // A retry with the same Idempotency-Key can meet the first attempt's still-held
      // reservation (409, retryable). The first failure is the real answer, so report that.
      if (previous && error.code === "conflict" && error.retryable) throw previous;
      previous = error;
      const transient = error.status === undefined || error.status === 429 || error.status >= 500;
      if (!options.retry || !error.retryable || !transient || attempt >= this.#maxRetries) throw error;
      await this.#sleep(
        retryAfterMs ?? Math.min(RETRY_BASE_MS * 2 ** attempt + Math.random() * 100, RETRY_MAX_MS)
      );
    }
  }
}

type Raw = Record<string, unknown>;

export function toOutcomeRun(body: unknown): OutcomeRun {
  const raw = (body ?? {}) as Raw;
  const cost = (raw.cost ?? {}) as Raw;
  if (typeof raw.outcome !== "string" || typeof raw.status !== "string") {
    throw new PramaanError("internal", "The API returned an unexpected run shape.");
  }
  return {
    outcome: raw.outcome,
    version: Number(raw.version ?? 1),
    plan: String(raw.plan),
    status: raw.status as OutcomeRun["status"],
    ...(typeof raw.completeness === "string"
      ? {
          completeness: raw.completeness as NonNullable<OutcomeRun["completeness"]>,
        }
      : {}),
    ...("result" in raw ? { result: raw.result } : {}),
    evidence: (raw.evidence ?? {}) as Record<string, unknown>,
    missing: (raw.missing ?? []) as unknown[],
    steps: ((raw.steps ?? []) as Raw[]).map(
      (step): OutcomeRunStep => ({
        id: String(step.id),
        label: String(step.label),
        capability: String(step.capability),
        effectClass: step.effect_class as OutcomeRunStep["effectClass"],
        status: String(step.status) as OutcomeRunStep["status"],
        calls: Number(step.calls ?? 0),
        effect: String(step.effect) as OutcomeRunStep["effect"],
        ...(typeof step.reason === "string" ? { reason: step.reason } : {}),
        ...(Array.isArray(step.errors)
          ? { errors: step.errors as NonNullable<OutcomeRunStep["errors"]> }
          : {}),
      })
    ),
    ...(raw.error ? { error: raw.error as NonNullable<OutcomeRun["error"]> } : {}),
    cost: {
      holdMicro: Number(cost.hold_micro ?? 0),
      chargedMicro: Number(cost.charged_micro ?? 0),
      capabilities: ((cost.capabilities ?? []) as Raw[]).map((row) => ({
        id: String(row.id),
        calls: Number(row.calls ?? 0),
        chargedMicro: Number(row.charged_micro ?? 0),
      })),
    },
  };
}
