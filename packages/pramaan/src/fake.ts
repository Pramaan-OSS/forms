// A fake Pramaan for tests: no network, no key. Route handlers answer each
// capability; anything unrouted throws, so a test fails loudly when code
// reaches for the network. Generation schemas are validated exactly as the
// real client validates them.
import { assertActionKey } from "./action-policy";
import { validateEmailSend } from "./email-validation";
import { completeGeneration, completeGenerationStream, generationError } from "./generation-reply";
import { type CapId, Pramaan, PramaanClient, validateGenerationRequest } from "./index";
import type { Job, LlmChatStreamEvent, OutcomeRunOptions, RunOptions } from "./sdk/types";

export type RouteHandler = (input: unknown, opts: RunOptions | undefined) => unknown | Promise<unknown>;

export type OutcomeRoutes = {
  list?: () => unknown[] | Promise<unknown[]>;
  get?: (id: string) => unknown | Promise<unknown>;
  estimate?: (id: string, input: unknown, opts?: OutcomeRunOptions) => unknown | Promise<unknown>;
  run?: (id: string, input: unknown, opts?: OutcomeRunOptions) => unknown | Promise<unknown>;
};

export class FakePramaan extends Pramaan {
  readonly calls: { id: string; input: unknown; opts: RunOptions | undefined }[] = [];
  #routes: Readonly<Record<string, RouteHandler>>;

  constructor(routes: Record<string, RouteHandler> = {}) {
    // The parent only wraps a real client for its typed helpers; no call ever
    // reaches it because `call` is overridden below.
    super(
      new PramaanClient({
        apiKey: "fake",
        fetch: () => Promise.reject(new Error("FakePramaan never reaches the network.")),
      })
    );
    this.#routes = routes;
  }

  override async call(id: CapId, input: unknown, opts?: RunOptions): Promise<unknown> {
    assertActionKey(id, opts?.idempotencyKey);
    if (id === "llm.chat" || id === "llm.complete" || id === "llm.complete-bulk")
      validateGenerationRequest(input);
    if (id === "email.send") validateEmailSend(input);
    if (id === "apps.connection.start") {
      const request = input as Record<string, any>;
      if (
        !request.app ||
        !request.redirectUrl ||
        !/^[A-Za-z0-9_.-]{1,128}$/.test(request.endUserRef) ||
        (request.access && !["read", "read-write"].includes(request.access))
      )
        throw new Error("Invalid owned connection request.");
    }
    this.calls.push({ id, input, opts });
    const route = this.#routes[id];
    if (!route) {
      throw new Error(`FakePramaan has no route for "${id}". Add one in the test.`);
    }
    try {
      const result = await route(input, opts);
      return id === "llm.chat" || id === "llm.complete" || id === "llm.complete-bulk"
        ? completeGeneration(result)
        : result;
    } catch (error) {
      throw id === "llm.chat" || id === "llm.complete" || id === "llm.complete-bulk"
        ? generationError(error)
        : error;
    }
  }

  /** Route one or more capability calls after construction. */
  route(routes: Record<string, RouteHandler>): void {
    this.#routes = { ...this.#routes, ...routes };
  }

  /** Every call made to a capability id, in order. */
  callsTo(id: CapId): unknown[] {
    return this.calls.filter((entry) => entry.id === id).map((entry) => entry.input);
  }

  readonly outcomeCalls: { verb: string; id?: string; input: unknown; opts?: OutcomeRunOptions }[] = [];
  #outcomeRoutes: OutcomeRoutes = {};

  routeOutcomes(routes: OutcomeRoutes): void {
    this.#outcomeRoutes = { ...this.#outcomeRoutes, ...routes };
  }

  override get outcomes() {
    type Outcomes = PramaanClient["outcomes"];
    return {
      list: async (): Promise<Awaited<ReturnType<Outcomes["list"]>>> => {
        this.outcomeCalls.push({ verb: "list", input: null });
        if (!this.#outcomeRoutes.list)
          throw new Error("FakePramaan has no outcomes.list route. Add one in the test.");
        return (await this.#outcomeRoutes.list()) as Awaited<ReturnType<Outcomes["list"]>>;
      },
      get: async (id: string): Promise<Awaited<ReturnType<Outcomes["get"]>>> => {
        this.outcomeCalls.push({ verb: "get", id, input: null });
        if (!this.#outcomeRoutes.get) throw new Error(`FakePramaan has no outcomes.get route for "${id}".`);
        return (await this.#outcomeRoutes.get(id)) as Awaited<ReturnType<Outcomes["get"]>>;
      },
      estimate: async (
        id: string,
        input: unknown,
        opts?: OutcomeRunOptions
      ): Promise<Awaited<ReturnType<Outcomes["estimate"]>>> => {
        this.outcomeCalls.push({ verb: "estimate", id, input, opts });
        if (!this.#outcomeRoutes.estimate)
          throw new Error(`FakePramaan has no outcomes.estimate route for "${id}".`);
        return (await this.#outcomeRoutes.estimate(id, input, opts)) as Awaited<
          ReturnType<Outcomes["estimate"]>
        >;
      },
      start: async (
        id: string,
        input: unknown,
        opts?: OutcomeRunOptions
      ): Promise<Awaited<ReturnType<Outcomes["start"]>>> => {
        this.outcomeCalls.push({ verb: "start", id, input, opts });
        if (!this.#outcomeRoutes.run) throw new Error(`FakePramaan has no outcomes.start route for "${id}".`);
        return (await this.#outcomeRoutes.run(id, input, opts)) as Awaited<ReturnType<Outcomes["start"]>>;
      },
      run: async (
        id: string,
        input: unknown,
        opts?: OutcomeRunOptions
      ): Promise<Awaited<ReturnType<Outcomes["run"]>>> => {
        this.outcomeCalls.push({ verb: "run", id, input, opts });
        if (!this.#outcomeRoutes.run) throw new Error(`FakePramaan has no outcomes.run route for "${id}".`);
        return (await this.#outcomeRoutes.run(id, input, opts)) as Awaited<ReturnType<Outcomes["run"]>>;
      },
    };
  }

  #jobRoutes: { get?: (id: string) => Promise<Job> | Job; cancel?: (id: string) => Promise<Job> | Job } = {};
  readonly jobCalls: { verb: string; id: string }[] = [];
  routeJobs(routes: {
    get?: (id: string) => Promise<Job> | Job;
    cancel?: (id: string) => Promise<Job> | Job;
  }) {
    this.#jobRoutes = routes;
  }
  override get jobs() {
    return {
      get: async (id: string): Promise<Job> => {
        this.jobCalls.push({ verb: "get", id });
        if (!this.#jobRoutes.get) throw new Error("FakePramaan has no jobs.get route.");
        return this.#jobRoutes.get(id);
      },
      cancel: async (id: string): Promise<Job> => {
        this.jobCalls.push({ verb: "cancel", id });
        if (!this.#jobRoutes.cancel) throw new Error("FakePramaan has no jobs.cancel route.");
        return this.#jobRoutes.cancel(id);
      },
      wait: async (id: string): Promise<Job> => {
        const job = await this.jobs.get(id);
        if (job.status === "running") throw new Error("Route a finished job for a fake wait.");
        return job;
      },
    };
  }

  readonly streamCalls: { id: string; input: unknown }[] = [];
  readonly estimateCalls: { id: string; input: unknown; opts?: RunOptions }[] = [];
  private estimateRoute?: (id: string, input: unknown, opts?: RunOptions) => unknown | Promise<unknown>;
  routeEstimate(route: NonNullable<FakePramaan["estimateRoute"]>) {
    this.estimateRoute = route;
  }
  override get capabilities() {
    return {
      ...super.capabilities,
      estimate: async (id: string, input: unknown, opts?: RunOptions) => {
        this.estimateCalls.push({ id, input, opts });
        if (!this.estimateRoute) throw new Error("Add an estimate route to this fixture.");
        return (await this.estimateRoute(id, input, opts)) as Awaited<
          ReturnType<Pramaan["capabilities"]["estimate"]>
        >;
      },
    };
  }
  override async run(id: CapId, input: unknown, opts?: RunOptions): Promise<unknown> {
    return this.call(id, input, opts);
  }

  #streamRoutes: {
    route?: (input: unknown) => AsyncGenerator<LlmChatStreamEvent>;
  } = {};

  routeStream(route: (input: unknown) => AsyncGenerator<LlmChatStreamEvent>): void {
    this.#streamRoutes = { route };
  }

  override llmChatStream(input: unknown, _opts?: RunOptions): AsyncGenerator<LlmChatStreamEvent> {
    const self = this;
    async function* routed(): AsyncGenerator<LlmChatStreamEvent> {
      validateGenerationRequest(input);
      self.streamCalls.push({ id: "llm.chat", input });
      if (!self.#streamRoutes.route)
        throw new Error('FakePramaan has no stream route for "llm.chat". Add one in the test.');
      yield* self.#streamRoutes.route(input);
    }
    return completeGenerationStream(routed());
  }
}
