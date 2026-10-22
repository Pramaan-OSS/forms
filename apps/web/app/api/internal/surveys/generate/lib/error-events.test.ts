import { describe, expect, test } from "vitest";
import { AIOutputTokenLimitError } from "@forms/ai";
import { PramaanError } from "@forms/pramaan";
import { TooManyRequestsError } from "@forms/types/errors";
import { V3SurveyGeneratedPayloadValidationError } from "@/app/api/v3/surveys/generate/service";
import { toStreamErrorEvent } from "./error-events";

describe("toStreamErrorEvent", () => {
  test("maps a quota error to ai_quota_exceeded and forwards retryAfter", () => {
    const event = toStreamErrorEvent(new TooManyRequestsError("ai_quota_exceeded", 42));

    expect(event.code).toBe("ai_quota_exceeded");
    expect(event.retryAfter).toBe(42);
  });

  test("maps the output token limit to ai_output_too_long", () => {
    expect(toStreamErrorEvent(new AIOutputTokenLimitError({ maxOutputTokens: 8192 })).code).toBe(
      "ai_output_too_long"
    );
  });

  test("maps a payload validation failure to ai_generated_payload_invalid with its params", () => {
    const invalidParams = [{ name: "generatedSurvey.name", reason: "Required" }];

    const event = toStreamErrorEvent(new V3SurveyGeneratedPayloadValidationError(invalidParams));

    expect(event.code).toBe("ai_generated_payload_invalid");
    expect(event.invalid_params).toEqual(invalidParams);
  });

  test("does not report a rate-limited call as rejected credentials", () => {
    // The service layer turns this into a TooManyRequestsError before it reaches here; this guards
    // the raw classification so a 429 can never fall into the credentials branch.
    const event = toStreamErrorEvent(
      new PramaanError("rate_limited", "slow down", { retryable: true, retryAfterMs: 4000, status: 429 })
    );

    expect(event.code).not.toBe("ai_provider_auth_failed");
    expect(event.detail).not.toMatch(/credentials/);
  });

  test.each([["a rejected key", new PramaanError("unauthorized", "bad key", { status: 401 })]])(
    "maps %s to ai_provider_auth_failed with a fixed operator-facing detail",
    (_label, error) => {
      const event = toStreamErrorEvent(error);

      expect(event.code).toBe("ai_provider_auth_failed");
      expect(event.detail).toMatch(/rejected this instance's credentials/);
      expect(event.detail).not.toMatch(/add more detail/);
    }
  );

  test("falls back to ai_generation_failed for anything else", () => {
    expect(toStreamErrorEvent(new Error("socket hang up")).code).toBe("ai_generation_failed");
  });

  test("never leaks the caught error's message into detail", () => {
    // The detail is rendered to the user, and provider errors routinely echo prompt fragments back.
    const leaky = new Error("prompt rejected: 'ask employees about their salary at ACME Corp'");

    const event = toStreamErrorEvent(leaky);

    expect(event.detail).not.toContain("ACME Corp");
    expect(event.detail).not.toContain(leaky.message);
    expect(event.detail.length).toBeGreaterThan(0);
  });
});
