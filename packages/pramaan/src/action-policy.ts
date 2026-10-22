import { capabilityInfo } from "./catalog";
import { PramaanError } from "./sdk/errors";

export const MISSING_ACTION_KEY = "Idempotency-Key header is required for this capability.";

/** Match the action header required by the service, including in offline fixtures. */
export function assertActionKey(id: string, key: unknown): void {
  const info = capabilityInfo(id);
  if (info && info.effectClass !== "read_only" && (typeof key !== "string" || !key.trim()))
    throw new PramaanError("invalid_request", MISSING_ACTION_KEY, { status: 400 });
}

/** Only fixed, safe reasons reach logs; upstream text can contain private values. */
export function safeActionFailureReason(error: unknown): string {
  if (!(error instanceof PramaanError)) return "The result could not be confirmed.";
  if (error.code === "invalid_request" && error.message === MISSING_ACTION_KEY) return MISSING_ACTION_KEY;
  const reasons: Record<string, string> = {
    invalid_request: "The request was invalid.",
    unauthorized: "The API key was refused.",
    rate_limited: "Too many requests; try again later.",
    conflict: "The request conflicts with an existing operation.",
    connection_required: "The required account connection is missing.",
    spend_cap_reached: "The account spending limit was reached.",
    upstream_unavailable: "The managed service is unavailable.",
    upstream_timeout: "The managed service did not answer in time.",
    not_found: "The requested record was not found.",
  };
  return reasons[error.code] ?? "The result could not be confirmed.";
}
