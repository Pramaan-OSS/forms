// @forms/pramaan — the one module through which every outside call in this
// product flows. Built from PRAMAAN_API_KEY and optional PRAMAAN_BASE_URL.
// Nothing else in the repository talks to an outside service. The SDK is
// provided by @pramaan/sdk with product compatibility helpers under src/sdk.
import { randomUUID } from "node:crypto";
import { assertActionKey } from "./action-policy";
import type { Caps } from "./capabilities";
import { CATALOG, capabilityInfo } from "./catalog";
import { completeGeneration, completeGenerationStream, generationError } from "./generation-reply";
import { normalizeGenerationSchemas, validateGenerationSchemas } from "./json-schema";
import { type WaitForModel, withModelRateLimit, withStreamRateLimit } from "./rate-limit";
import { runtimeFakeFetch } from "./runtime-fake";
import { PramaanClient } from "./sdk/client";
import { PramaanError } from "./sdk/errors";
import type {
  CapabilityDescription,
  CapabilityInfo,
  CapabilitySummary,
  Estimate,
  Job,
  JobStatus,
  LlmChatStreamEvent,
  OutcomeDescription,
  OutcomeEstimate,
  OutcomeRun,
  OutcomeRunOptions,
  OutcomeRunStep,
  OutcomeStep,
  OutcomeSummary,
  RunOptions,
  WaitOptions,
} from "./sdk/types";

export { safeActionFailureReason } from "./action-policy";

export { IncompleteGeneration } from "./generation-reply";

export { CATALOG, capabilityInfo };
export {
  assertBoundedJsonSchema,
  normalizeJsonSchema,
  normalizeGenerationSchemas,
  validateGenerationSchemas,
} from "./json-schema";
export { firstList, firstText, type JsonObject, type JsonValue, list, record, text } from "./json";
export { DEFAULT_BASE_URL, PRAMAAN_API_URL, PramaanClient, type PramaanOptions } from "./sdk/client";
export { toOutcomeRun } from "./sdk/client";
export { type ErrorCode, PramaanError } from "./sdk/errors";
export type {
  CapabilityDescription,
  CapabilityInfo,
  CapabilitySummary,
  Estimate,
  Job,
  JobStatus,
  LlmChatStreamEvent,
  OutcomeDescription,
  OutcomeEstimate,
  OutcomeRun,
  OutcomeRunOptions,
  OutcomeRunStep,
  OutcomeStep,
  OutcomeSummary,
  RunOptions,
  WaitOptions,
};
export type { Caps, Message, ToolDef } from "./capabilities";

/** Capability ids this product calls, as a const so callers never mistype one. */
export const Cap = {
  emailSend: "email.send",
  emailTemplateSend: "email.template.send",
  emailStatus: "email.status",
  emailAttachmentFromUrl: "email.attachment.from-url",
  emailAttachmentGet: "email.attachment.get",
  storageBucketsList: "storage.buckets.list",
  storageBucketCreate: "storage.bucket.create",
  storageObjectHead: "storage.object.head",
  storageObjectPut: "storage.object.put",
  storageObjectGet: "storage.object.get",
  storageObjectDelete: "storage.object.delete",
  storageObjectUploadUrl: "storage.object.upload-url",
  storageObjectDownloadUrl: "storage.object.download-url",
  storageObjectsList: "storage.objects.list",
  storageUploadCreate: "storage.upload.create",
  storageUploadPartPut: "storage.upload.part.put",
  storageUploadComplete: "storage.upload.complete",
  storageUploadAbort: "storage.upload.abort",
  llmChat: "llm.chat",
  llmComplete: "llm.complete",
  llmCompleteBulk: "llm.complete-bulk",
  databaseProvision: "db.postgres.provision",
  authBackendProvision: "auth.backend.provision",
  authBackendDomainsSet: "auth.backend.domains.set",
  authTokenVerify: "auth.token.verify",
  authUserDelete: "auth.user.delete",
  authBotCheckVerify: "auth.bot-check.verify",
  authSocialExchange: "auth.social.exchange",
  authEnterpriseStart: "auth.enterprise.start",
  authEnterpriseConnectionCreate: "auth.enterprise-connection.create",
  authEnterpriseConnectionDelete: "auth.enterprise-connection.delete",
  authEnterpriseConnectionsList: "auth.enterprise-connections.list",
  appsCatalogSearch: "apps.catalog.search",
  appsConnectionStart: "apps.connection.start",
  appsConnectionsList: "apps.connections.list",
  appsConnectionRevoke: "apps.connection.revoke",
  appsActionExecute: "apps.action.execute",
  peopleEmailValidate: "people.email.validate",
  peopleEmailToxicityCheck: "people.email.toxicity.check",
  textSentimentAnalyze: "text.sentiment.analyze",
  textLanguageDetect: "text.language.detect",
  textTranslate: "text.translate",
  textClassify: "text.classify",
  imageSearch: "image.search",
  brandIdentityGet: "brand.identity.get",
  brandColorsGet: "brand.colors.get",
  companiesEnrich: "companies.enrich",
} as const;

export type CapId = (typeof Cap)[keyof typeof Cap];

/** Plain words for a surface that cannot run yet. No service name, no detail. */
export const NOT_AVAILABLE = "This feature is not available yet.";

/** True when an error means the capability is not served yet. */
export function isUnavailable(error: unknown): boolean {
  return (
    error instanceof PramaanError && (error.code === "upstream_unavailable" || error.code === "not_found")
  );
}

/**
 * Message to show for a failed outside call. Unavailable surfaces get one
 * plain sentence; everything else gets a generic line. Never a service name,
 * never a stack trace, never the raw error.
 */
export function unavailableMessage(error: unknown): string {
  if (error instanceof MissingPramaanKey) return MISSING_KEY_MESSAGE;
  if (error instanceof Error && [NOT_AVAILABLE, MISSING_KEY_MESSAGE].includes(error.message))
    return error.message;
  return isUnavailable(error)
    ? NOT_AVAILABLE
    : "Could not confirm the result. Check its status before trying again.";
}
export const MISSING_KEY_MESSAGE = "Add PRAMAAN_API_KEY to .env";
export class MissingPramaanKey extends PramaanError {
  constructor() {
    super("unauthorized", MISSING_KEY_MESSAGE, { status: 422 });
  }
}
export function requirePramaan(): Pramaan {
  const client = pramaanFromEnv();
  if (!client) throw new MissingPramaanKey();
  return client;
}

export function validateGenerationRequest(input: unknown): asserts input is Caps.LlmRequest {
  const request = input as Caps.LlmRequest & { prompt?: unknown };
  if (
    !request ||
    typeof request !== "object" ||
    "prompt" in request ||
    !Array.isArray(request.messages) ||
    !request.messages.length
  )
    throw new PramaanError("invalid_request", "Generation requires messages instead of prompt.");
  for (const [index, message] of request.messages.entries())
    if (
      !message ||
      !["system", "user", "assistant", "tool"].includes(message.role) ||
      typeof message.content !== "string"
    )
      throw new PramaanError(
        "invalid_request",
        `Generation messages at #/messages/${index} must contain a role and text.`
      );
  if (!Number.isInteger(request.maxTokens) || request.maxTokens! < 64 || request.maxTokens! > 8192)
    throw new PramaanError("invalid_request", "Generation requires maxTokens from 64 to 8192.");
  validateGenerationSchemas(request);
}
export function prepareGenerationRequest(input: unknown): Caps.LlmRequest {
  const request = normalizeGenerationSchemas({
    ...(input as Record<string, unknown>),
    maxTokens: (input as Caps.LlmRequest)?.maxTokens ?? 256,
  });
  validateGenerationRequest(request);
  return request;
}

export class Pramaan {
  constructor(
    private readonly client: PramaanClient,
    private readonly waitForRateLimit?: WaitForModel
  ) {}

  get raw(): PramaanClient {
    return this.client;
  }

  async call(id: CapId, input: unknown, opts?: RunOptions): Promise<unknown> {
    assertActionKey(id, opts?.idempotencyKey);
    if (id === Cap.llmChat || id === Cap.llmComplete || id === Cap.llmCompleteBulk) {
      const prepared = prepareGenerationRequest(input);
      return withModelRateLimit(() => this.client.call(id, prepared, opts), this.waitForRateLimit)
        .then(completeGeneration)
        .catch((error) => {
          throw generationError(error);
        });
    }
    return this.client.call(id, input, opts);
  }
  async run(id: CapId, input: unknown, opts?: RunOptions): Promise<unknown> {
    assertActionKey(id, opts?.idempotencyKey);
    const generation = id === Cap.llmChat || id === Cap.llmComplete || id === Cap.llmCompleteBulk;
    try {
      const result = await this.client.run(id, generation ? prepareGenerationRequest(input) : input, opts);
      return generation ? completeGeneration(result) : result;
    } catch (error) {
      throw generation ? generationError(error) : error;
    }
  }

  info(id: string) {
    return this.client.info(id);
  }

  get jobs() {
    return this.client.jobs;
  }

  get capabilities() {
    return this.client.capabilities;
  }

  /**
   * Outcomes: fixed recipes of capability steps. Estimate first (the plan is
   * good for 15 minutes), show a person the steps when approval is needed,
   * then run with the plan. A long run answers 202 + a job; cancel through
   * jobs.cancel. Never auto-retry a run: a step with effect "unknown" may
   * already have acted — tell the user to check before retrying.
   */
  get accounts() {
    return this.client.accounts;
  }
  get outcomes() {
    return this.client.outcomes;
  }

  llmChatStream(input: Caps.LlmRequest, opts?: RunOptions): AsyncGenerator<LlmChatStreamEvent> {
    const prepared = prepareGenerationRequest(input);
    return completeGenerationStream(
      withStreamRateLimit(() => this.client.llmChatStream(prepared, opts), this.waitForRateLimit)
    );
  }

  // ── Typed helpers, one per capability family the product uses ─────────────

  emailSend(input: Caps.EmailSendRequest, opts?: RunOptions) {
    return this.call(Cap.emailSend, input, opts) as Promise<Caps.EmailSendResult>;
  }
  emailTemplateSend(input: Caps.EmailTemplateSendRequest, opts?: RunOptions) {
    return this.call(Cap.emailTemplateSend, input, opts);
  }
  emailStatus(input: { ref: string }, opts?: RunOptions) {
    return this.call(Cap.emailStatus, input, opts);
  }
  appsCatalogSearch(input: Caps.AppsCatalogSearchRequest, opts?: RunOptions) {
    return this.call(Cap.appsCatalogSearch, input, opts) as Promise<Caps.AppsCatalogSearchResult>;
  }
  appsConnectionStart(input: Caps.AppsConnectionStartRequest, opts?: RunOptions) {
    return this.call(Cap.appsConnectionStart, input, opts);
  }
  appsConnectionsList(input: Caps.AppsConnectionsListRequest, opts?: RunOptions) {
    return this.call(Cap.appsConnectionsList, input, opts);
  }
  appsActionExecute(input: Caps.AppsActionExecuteRequest, opts?: RunOptions) {
    return this.call(Cap.appsActionExecute, input, opts);
  }
  llmChat(input: Caps.LlmRequest, opts?: RunOptions) {
    return this.call(Cap.llmChat, input, opts) as Promise<Caps.LlmResult>;
  }
  llmComplete(input: Caps.LlmRequest, opts?: RunOptions) {
    return this.call(Cap.llmComplete, input, opts) as Promise<Caps.LlmResult>;
  }
}

/**
 * A new key for an `external_*` call: the same key can never run the call twice.
 */
export function idempotencyKey(): string {
  return randomUUID();
}

/** Builds a client from explicit settings (env loaders pass theirs). */
export function createPramaan(options: {
  apiKey: string;
  baseUrl?: string;
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  waitForRateLimit?: WaitForModel;
}): Pramaan {
  return new Pramaan(
    new PramaanClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      fetch: options.fetch ?? (process.env.PRAMAAN_FAKE === "1" ? runtimeFakeFetch : undefined),
      sleep: options.sleep,
    }),
    options.waitForRateLimit
  );
}

/**
 * The one place `PRAMAAN_API_KEY` is read from the environment. Every consumer
 * gets its client (or its answer about whether one is configured) from here.
 */
export function pramaanFromEnv(): Pramaan | null {
  const apiKey = process.env.PRAMAAN_API_KEY?.trim();
  if (!apiKey) return null;
  return createPramaan({
    apiKey,
    baseUrl: process.env.PRAMAAN_BASE_URL?.trim() || undefined,
  });
}

/** True when a key is configured. */
export function pramaanKeySet(): boolean {
  return Boolean(process.env.PRAMAAN_API_KEY?.trim());
}
