import {
  LEAKY_AI_ERRORS,
  PLANTED_USER_CONTENT,
  buildInvalidReplyError,
  buildPlatformCallError,
  buildRejectedKeyError,
  findPlantedContent,
} from "@/lib/ai/__mocks__/leaky-ai-errors";
import { describe, expect, test } from "vitest";
import { AIInvalidReplyError, AIOutputTokenLimitError, classifyAIProviderError } from "@forms/ai";
import { InvalidInputError, TooManyRequestsError } from "@forms/types/errors";
import { stackFrames } from "@/lib/utils/loggable-error";
import {
  RedactedAIError,
  describeAIError,
  isAIFailureChain,
  loggableAIError,
  redactAIError,
} from "./loggable-error";

describe("loggableAIError", () => {
  test.each(LEAKY_AI_ERRORS)("logs nothing the call filled in from %s", (_, build) => {
    const error = build();
    // The fixture has to carry the content for this test to mean anything.
    expect(findPlantedContent(error)).toBeDefined();

    const logged = loggableAIError(error);

    expect(findPlantedContent(logged)).toBeUndefined();
    expect(logged).toMatchObject({
      errName: error.name,
      errStack: expect.stringMatching(/^ +at \S.*(?:\n +at \S.*)*$/),
    });
  });

  test("keeps the platform status and the failure's fixed code", () => {
    expect(loggableAIError(buildPlatformCallError(500))).toMatchObject({
      errName: "PramaanError",
      providerStatusCode: 500,
      lastErrCode: "internal",
    });
  });

  test("finds the platform status of an error under a cause", () => {
    const wrapped = new Error("outer", {
      cause: new Error("middle", { cause: buildPlatformCallError(429) }),
    });

    expect(loggableAIError(wrapped)).toMatchObject({ providerStatusCode: 429 });
  });

  test("stops on a cause cycle that carries no status, without one", () => {
    const error = new Error("loop");
    error.cause = error;

    expect(loggableAIError(error)).not.toHaveProperty("providerStatusCode");
  });

  test("names the causes that tell a schema mismatch from unparseable output", () => {
    expect(loggableAIError(buildInvalidReplyError())).toMatchObject({
      errName: "AIInvalidReplyError",
      errCauseNames: ["Error"],
    });
  });

  test("records a cause that is not an Error by its type alone", () => {
    const error = new Error("wrapped", { cause: "planted text" });

    expect(describeAIError(error)).toMatchObject({ errCauseNames: ["string"] });
  });

  test("logs only the type of something thrown that is not an Error", () => {
    expect(loggableAIError("planted text")).toEqual({ errType: "string" });
  });
});

describe("redactAIError", () => {
  test.each(LEAKY_AI_ERRORS)("replaces %s with an error that carries none of the call", (_, build) => {
    const error = build();

    const redacted = redactAIError(error);

    expect(redacted).toBeInstanceOf(RedactedAIError);
    expect(findPlantedContent(redacted)).toBeUndefined();
    expect(redacted).toMatchObject({ name: "RedactedAIError", originalName: error.name });
    expect((redacted as Error).cause).toBeUndefined();
  });

  test("keeps the original's frames, under a header its own frame filter accepts", () => {
    const redacted = redactAIError(buildInvalidReplyError()) as RedactedAIError;

    expect(redacted.providerStatusCode).toBeUndefined();
    expect(redacted.message).toContain("AIInvalidReplyError");
    expect(stackFrames(redacted).join("\n")).toContain("leaky-ai-errors");
  });

  test.each([
    ["a quota error", new TooManyRequestsError("ai_quota_exceeded", 30)],
    ["an input error", new InvalidInputError("ai_output_too_long")],
    ["a token-limit error", new AIOutputTokenLimitError({ maxOutputTokens: 10 })],
    ["a rejected-key error", buildRejectedKeyError()],
    ["a plain error", new Error("boom")],
  ])("passes %s through unchanged, so callers can still branch on it", (_, error) => {
    expect(redactAIError(error)).toBe(error);
  });

  // A streamed error can reach a caller as a plain object holding the platform's message, and
  // a whole-error sink would log every field of it. Nothing that is not an Error is let through.
  test.each([
    ["a string", PLANTED_USER_CONTENT],
    ["a platform error object", { error: { message: PLANTED_USER_CONTENT, code: "invalid_request" } }],
    ["undefined", undefined],
    ["null", null],
  ])("replaces %s with an error naming only its type", (_, thrown) => {
    const redacted = redactAIError(thrown);

    expect(redacted).toBeInstanceOf(RedactedAIError);
    expect(redacted).toMatchObject({ originalName: typeof thrown });
    expect(findPlantedContent(redacted)).toBeUndefined();
  });

  test("passes an app error wrapping a platform error through, so its status stays readable", () => {
    const wrapped = new Error("Translation failed", { cause: buildPlatformCallError(503) });

    expect(redactAIError(wrapped)).toBe(wrapped);
    expect(loggableAIError(wrapped)).toMatchObject({ providerStatusCode: 503 });
  });
});

describe("isAIFailureChain", () => {
  test("stops on a cause cycle instead of looping", () => {
    const error = new Error("loop");
    error.cause = error;

    expect(isAIFailureChain(error)).toBe(false);
  });

  test("finds an invalid-reply error under a cause", () => {
    expect(isAIFailureChain(new Error("wrapped", { cause: buildInvalidReplyError() }))).toBe(true);
  });

  test("a plain error, a platform error and the token-limit error are not redacted", () => {
    expect(isAIFailureChain(new Error("boom"))).toBe(false);
    expect(isAIFailureChain(new AIInvalidReplyError("bad reply"))).toBe(true);
    expect(classifyAIProviderError(new AIInvalidReplyError("bad reply"))).toBeUndefined();
  });
});
