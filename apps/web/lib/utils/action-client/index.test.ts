import { DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "@forms/logger";
import {
  AuthenticationError,
  AuthorizationError,
  EXPECTED_ERROR_NAMES,
  INVALID_PASSWORD_RESET_TOKEN_ERROR_CODE,
  InvalidInputError,
  InvalidPasswordResetTokenError,
  OperationNotAllowedError,
  QueryExecutionError,
  ResourceNotFoundError,
  TooManyRequestsError,
  UniqueConstraintError,
  UnknownError,
  ValidationError,
  isExpectedError,
} from "@forms/types/errors";
import { RequestBodyTooLargeError } from "@/app/lib/api/request-body";
import { getSession } from "@/modules/auth/lib/session";

// Mock logger
vi.mock("@forms/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock session DAL
vi.mock("@/modules/auth/lib/session", () => ({
  getSession: vi.fn(),
}));

// Mock user service
vi.mock("@/lib/user/service", () => ({
  getUser: vi.fn(),
}));

// ── shared helper tests (pure logic, no action client needed) ──────────

describe("isExpectedError (shared helper)", () => {
  test("EXPECTED_ERROR_NAMES contains exactly the right error names", () => {
    const expected = [
      "ResourceNotFoundError",
      "AuthorizationError",
      "InvalidInputError",
      "ValidationError",
      "AuthenticationError",
      "OperationNotAllowedError",
      "QueryExecutionError",
      "TooManyRequestsError",
      "InvalidPasswordResetTokenError",
      "UniqueConstraintError",
      "RequestBodyTooLargeError",
    ];

    expect(EXPECTED_ERROR_NAMES.size).toBe(expected.length);
    for (const name of expected) {
      expect(EXPECTED_ERROR_NAMES.has(name)).toBe(true);
    }
  });

  test.each([
    { ErrorClass: AuthorizationError, args: ["Not authorized"] },
    { ErrorClass: AuthenticationError, args: ["Not authenticated"] },
    { ErrorClass: TooManyRequestsError, args: ["Rate limit exceeded"] },
    { ErrorClass: ResourceNotFoundError, args: ["Survey", "123"] },
    { ErrorClass: InvalidInputError, args: ["Invalid input"] },
    { ErrorClass: ValidationError, args: ["Invalid data"] },
    { ErrorClass: OperationNotAllowedError, args: ["Not allowed"] },
    { ErrorClass: QueryExecutionError, args: ["Cube query failed. Details: connect ECONNREFUSED"] },
    { ErrorClass: InvalidPasswordResetTokenError, args: [INVALID_PASSWORD_RESET_TOKEN_ERROR_CODE] },
    { ErrorClass: UniqueConstraintError, args: ["Already exists"] },
    { ErrorClass: RequestBodyTooLargeError, args: [2 * 1024 * 1024] },
  ])("returns true for $ErrorClass.name", ({ ErrorClass, args }) => {
    const error = new (ErrorClass as any)(...args);
    expect(isExpectedError(error)).toBe(true);
  });

  test("returns true for serialised errors that only have a matching name", () => {
    const serialisedError = new Error("Auth failed");
    serialisedError.name = "AuthorizationError";
    expect(isExpectedError(serialisedError)).toBe(true);
  });

  test.each([
    { error: new Error("Something broke"), label: "Error" },
    { error: new TypeError("Cannot read properties"), label: "TypeError" },
    { error: new RangeError("Maximum call stack"), label: "RangeError" },
    { error: new UnknownError("Unknown"), label: "UnknownError" },
  ])("returns false for $label", ({ error }) => {
    expect(isExpectedError(error)).toBe(false);
  });
});

// ── integration tests against the real actionClient / authenticatedActionClient ──

describe("actionClient handleServerError", () => {
  // Lazily import so mocks are in place first
  let actionClient: (typeof import("./index"))["actionClient"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./index");
    actionClient = mod.actionClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper: create and execute an action that throws the given error
  const executeThrowingAction = async (error: Error) => {
    const action = actionClient.action(async () => {
      throw error;
    });
    return action();
  };

  describe("expected errors should NOT be logged as server errors", () => {
    test("AuthorizationError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new AuthorizationError("Not authorized"));
      expect(result?.serverError).toBe("Not authorized");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("AuthenticationError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new AuthenticationError("Not authenticated"));
      expect(result?.serverError).toBe("Not authenticated");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("TooManyRequestsError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new TooManyRequestsError("Rate limit exceeded"));
      expect(result?.serverError).toBe("Rate limit exceeded");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("ResourceNotFoundError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new ResourceNotFoundError("Survey", "123"));
      expect(result?.serverError).toContain("Survey");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("InvalidInputError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new InvalidInputError("Invalid input"));
      expect(result?.serverError).toBe("Invalid input");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("ValidationError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new ValidationError("Invalid data"));
      expect(result?.serverError).toBe("Invalid data");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("OperationNotAllowedError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(new OperationNotAllowedError("Not allowed"));
      expect(result?.serverError).toBe("Not allowed");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("QueryExecutionError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(
        new QueryExecutionError("Cube query failed. Details: connect ECONNREFUSED")
      );
      expect(result?.serverError).toBe("Cube query failed. Details: connect ECONNREFUSED");
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("InvalidPasswordResetTokenError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(
        new InvalidPasswordResetTokenError(INVALID_PASSWORD_RESET_TOKEN_ERROR_CODE)
      );
      expect(result?.serverError).toBe(INVALID_PASSWORD_RESET_TOKEN_ERROR_CODE);
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("UniqueConstraintError returns its message and is not logged as a server error", async () => {
      const result = await executeThrowingAction(
        new UniqueConstraintError("Action with name foo already exists")
      );
      expect(result?.serverError).toBe("Action with name foo already exists");
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("unexpected errors SHOULD be logged as server errors", () => {
    test("generic Error is logged as a server error and returns default message", async () => {
      const error = new Error("Something broke");
      const result = await executeThrowingAction(error);
      expect(result?.serverError).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
      expect(logger.error).toHaveBeenCalledWith(error, "SERVER ERROR");
    });

    test("an unauthenticated action's error is captured without a user", async () => {
      await executeThrowingAction(new Error("Something broke"));
      expect(logger.error).toHaveBeenCalledWith(expect.any(Error), "SERVER ERROR");
    });

    test("TypeError is logged as a server error and returns default message", async () => {
      const error = new TypeError("Cannot read properties of undefined");
      const result = await executeThrowingAction(error);
      expect(result?.serverError).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
      expect(logger.error).toHaveBeenCalledWith(error, "SERVER ERROR");
    });

    test("UnknownError is logged as a server error (not an expected business-logic error)", async () => {
      const error = new UnknownError("Unknown error");
      const result = await executeThrowingAction(error);
      expect(result?.serverError).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
      expect(logger.error).toHaveBeenCalledWith(error, "SERVER ERROR");
    });
  });
});

describe("authenticatedActionClient", () => {
  let authenticatedActionClient: (typeof import("./index"))["authenticatedActionClient"];
  let getUser: (typeof import("@/lib/user/service"))["getUser"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./index");
    authenticatedActionClient = mod.authenticatedActionClient;
    const userService = await import("@/lib/user/service");
    getUser = userService.getUser;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("throws AuthenticationError when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const action = authenticatedActionClient.action(async () => "ok");
    const result = await action();

    // handleServerError catches AuthenticationError and returns its message
    expect(result?.serverError).toBe("Not authenticated");
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("throws AuthorizationError when user is not found", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "user-1" }, expires: "2999-01-01T00:00:00.000Z" });
    vi.mocked(getUser).mockResolvedValue(null as any);

    const action = authenticatedActionClient.action(async () => "ok");
    const result = await action();

    expect(result?.serverError).toBe("User not found");
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("executes action successfully when session and user exist", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "user-1" }, expires: "2999-01-01T00:00:00.000Z" });
    vi.mocked(getUser).mockResolvedValue({ id: "user-1", name: "Test" } as any);

    const action = authenticatedActionClient.action(async () => "success");
    const result = await action();

    expect(result?.data).toBe("success");
    expect(result?.serverError).toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("logs an unexpected error from a signed-in action as a server error", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "user-1" }, expires: "2999-01-01T00:00:00.000Z" });
    vi.mocked(getUser).mockResolvedValue({ id: "user-1", name: "Test", email: "test@example.com" } as Awaited<
      ReturnType<typeof getUser>
    >);
    const error = new Error("Something broke");

    const action = authenticatedActionClient.action(async () => {
      throw error;
    });
    const result = await action();

    expect(result?.serverError).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
    expect(logger.error).toHaveBeenCalledWith(error, "SERVER ERROR");
  });
});
