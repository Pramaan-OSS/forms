import { beforeEach, describe, expect, test, vi } from "vitest";
import { reportApiError } from "./api-error-reporter";

const loggerMocks = vi.hoisted(() => {
  const contextualError = vi.fn();
  const rootError = vi.fn();
  const withContext = vi.fn(() => ({
    error: contextualError,
  }));

  return {
    contextualError,
    rootError,
    withContext,
  };
});

vi.mock("@forms/logger", () => ({
  logger: {
    withContext: loggerMocks.withContext,
    error: loggerMocks.rootError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("reportApiError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("logs real errors with structured context", () => {
    const request = new Request("https://app.test/api/v2/client/environment", {
      method: "POST",
      headers: {
        "x-request-id": "req-1",
      },
    });
    const error = new Error("boom");

    reportApiError({
      request,
      status: 500,
      error,
    });

    expect(loggerMocks.withContext).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "v2",
        correlationId: "req-1",
        method: "POST",
        path: "/api/v2/client/environment",
        status: 500,
        error: expect.objectContaining({
          name: "Error",
          message: "boom",
        }),
      })
    );
    expect(loggerMocks.contextualError).toHaveBeenCalledWith("API V2 Error Details");
  });

  test("logs non-error payloads without throwing", () => {
    const request = new Request("https://app.test/api/v1/management/surveys", {
      headers: {
        "x-request-id": "req-2",
      },
    });
    const payload = {
      type: "internal_server_error",
      details: [{ field: "server", issue: "error occurred" }],
    };

    expect(() =>
      reportApiError({
        request,
        status: 500,
        error: payload,
      })
    ).not.toThrow();

    expect(loggerMocks.contextualError).toHaveBeenCalledWith("API V1 Error Details");
  });

  test("swallows logging failures after reporting the reporter error", () => {
    loggerMocks.withContext.mockImplementationOnce(() => {
      throw new Error("log sink down");
    });

    const request = new Request("https://app.test/api/v2/client/displays", {
      headers: {
        "x-request-id": "req-3",
      },
    });

    expect(() =>
      reportApiError({
        request,
        status: 500,
        error: new Error("boom"),
      })
    ).not.toThrow();

    expect(loggerMocks.rootError).toHaveBeenCalledWith(
      expect.objectContaining({
        apiVersion: "v2",
        correlationId: "req-3",
        method: "GET",
        path: "/api/v2/client/displays",
        status: 500,
        reportingError: expect.objectContaining({
          name: "Error",
          message: "log sink down",
        }),
      }),
      "Failed to report API error"
    );
  });

  test("serializes cyclic payloads without throwing", () => {
    const request = new Request("https://app.test/api/v2/client/responses", {
      headers: {
        "x-request-id": "req-4",
      },
    });
    const payload: Record<string, unknown> = {
      type: "internal_server_error",
    };

    payload.self = payload;

    expect(() =>
      reportApiError({
        request,
        status: 500,
        error: payload,
      })
    ).not.toThrow();

    expect(loggerMocks.withContext).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          type: "internal_server_error",
          self: "[Circular]",
        }),
      })
    );
  });
});
