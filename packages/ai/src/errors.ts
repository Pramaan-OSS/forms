import { PramaanError } from "@forms/pramaan";
import type { TAIGenerationUsage } from "./types";

export interface AIConfigurationErrorDetails {
  provider?: string | null;
  model?: string | null;
  missingFields?: string[];
  invalidFields?: string[];
}

export class AIConfigurationError extends Error {
  code: "providerMissing" | "invalidProvider" | "providerNotConfigured";
  details: AIConfigurationErrorDetails;

  constructor(
    code: "providerMissing" | "invalidProvider" | "providerNotConfigured",
    message: string,
    details: AIConfigurationErrorDetails = {}
  ) {
    super(message);
    this.name = "AIConfigurationError";
    this.code = code;
    this.details = details;
  }
}

export interface AIOutputTokenLimitErrorDetails {
  maxOutputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

/**
 * Thrown when a generation ends because the model hit the reply limit (finish reason
 * "length") before completing its response, so no valid structured output exists. A
 * cut-off reply is never treated as complete; callers branch on this to ask for a
 * larger budget or split the work.
 */
export class AIOutputTokenLimitError extends Error {
  details: AIOutputTokenLimitErrorDetails;

  constructor(details: AIOutputTokenLimitErrorDetails = {}) {
    super("AI generation stopped because the output token limit was reached");
    this.name = "AIOutputTokenLimitError";
    this.details = details;
  }
}

/**
 * Thrown when a finished reply does not parse as JSON or fails its schema. Carries the
 * token usage so budget accounting can charge the failed call.
 */
export class AIInvalidReplyError extends Error {
  readonly usage: TAIGenerationUsage | undefined;

  constructor(message: string, usage?: TAIGenerationUsage) {
    super(message);
    this.name = "AIInvalidReplyError";
    this.usage = usage;
  }
}

export interface AIProviderErrorInfo {
  /** The platform rejected this instance's key. */
  isAuthFailure: boolean;
  /** The platform answered 429 or the instance's spend cap is reached. */
  isQuotaExhausted: boolean;
  /** Whether the underlying call is worth retrying later. */
  isRetryable: boolean;
  statusCode?: number;
  /** Parsed from the platform's `Retry-After` (seconds), when present. */
  retryAfterSeconds?: number;
}

/**
 * Classify a generation failure into platform-level signals the app can act on — chiefly
 * whether the platform rate-limited the call (quota exhausted) so callers surface a clear,
 * retryable message. An unavailable surface is reported as not retryable: it needs the
 * platform to serve the capability, not another attempt.
 */
export const classifyAIProviderError = (error: unknown): AIProviderErrorInfo | undefined => {
  if (!(error instanceof PramaanError)) return undefined;

  switch (error.code) {
    case "rate_limited":
      return {
        isAuthFailure: false,
        isQuotaExhausted: true,
        isRetryable: true,
        statusCode: error.status ?? 429,
        ...(error.retryAfterMs === undefined
          ? {}
          : { retryAfterSeconds: Math.max(1, Math.ceil(error.retryAfterMs / 1000)) }),
      };
    case "spend_cap_reached":
      return {
        isAuthFailure: false,
        isQuotaExhausted: true,
        isRetryable: false,
        statusCode: error.status ?? 402,
      };
    case "unauthorized":
      return {
        isAuthFailure: true,
        isQuotaExhausted: false,
        isRetryable: false,
        statusCode: error.status ?? 401,
      };
    case "upstream_timeout":
      return { isAuthFailure: false, isQuotaExhausted: false, isRetryable: false, statusCode: 504 };
    case "upstream_unavailable":
      // The client marks a transport-level outage retryable; a capability that is not served at
      // all is not. Callers that retry anyway keep it inside their own bounded policy.
      return {
        isAuthFailure: false,
        isQuotaExhausted: false,
        isRetryable: error.retryable === true,
        statusCode: error.status ?? 502,
      };
    case "invalid_request":
      return { isAuthFailure: false, isQuotaExhausted: false, isRetryable: false, statusCode: 400 };
    case "conflict":
      return { isAuthFailure: false, isQuotaExhausted: false, isRetryable: false, statusCode: 409 };
    default:
      return {
        isAuthFailure: false,
        isQuotaExhausted: false,
        isRetryable: false,
        ...(error.status === undefined ? {} : { statusCode: error.status }),
      };
  }
};
