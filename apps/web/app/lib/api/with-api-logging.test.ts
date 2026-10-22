import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TAuthenticationApiKey } from "@forms/types/auth";
import { withV1ApiWrapper } from "./with-api-logging";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getSession: vi.fn(),
  applyRateLimit: vi.fn(),
  applyIPRateLimit: vi.fn(),
  isRouteRateLimitedByEnvoy: vi.fn(() => false),
}));

vi.mock("@/app/api/v1/auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));
vi.mock("@/modules/auth/lib/session", () => ({
  getSession: mocks.getSession,
}));
vi.mock("@/modules/core/rate-limit/helpers", () => ({
  applyRateLimit: mocks.applyRateLimit,
  applyIPRateLimit: mocks.applyIPRateLimit,
}));
vi.mock("@/modules/core/rate-limit/envoy-rate-limit-coverage", () => ({
  isRouteRateLimitedByEnvoy: mocks.isRouteRateLimitedByEnvoy,
  TEnvoyRateLimitAuthType: {},
}));
vi.mock("@/app/middleware/endpoint-validator", () => ({
  AuthenticationMethod: { ApiKey: "apiKey", Session: "session", Both: "both", None: "none" },
  isClientSideApiRoute: (pathname: string) => ({
    isClientSideApi: pathname.startsWith("/api/v1/client"),
    isRateLimited: pathname.startsWith("/api/v1/client"),
  }),
  isManagementApiRoute: (pathname: string) => ({
    isManagementApi: pathname.startsWith("/api/v1/management"),
    authenticationMethod: "both",
  }),
  isIntegrationRoute: (pathname: string) => pathname.startsWith("/api/v1/integrations"),
}));
vi.mock("@/lib/authorization/context", () => ({
  withAuthorizationSurface: (_surface: string, fn: () => Promise<unknown>) => fn(),
}));

const apiKeyAuth = (overrides: Partial<TAuthenticationApiKey> = {}): TAuthenticationApiKey =>
  ({
    apiKeyId: "key-1",
    organizationId: "org-1",
    workspacePermissions: ["ws-1"],
    ...overrides,
  }) as TAuthenticationApiKey;

const makeRequest = (pathname: string, method = "GET"): NextRequest =>
  new NextRequest(`https://example.com${pathname}`, {
    method,
    headers: { "x-api-key": "test-api-key" },
  });

const okResponse = () => new Response(JSON.stringify({ data: {} }), { status: 200 });

describe("withV1ApiWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyRateLimit.mockResolvedValue(undefined);
    mocks.applyIPRateLimit.mockResolvedValue(undefined);
  });

  test("authenticates management routes with an API key and runs the handler", async () => {
    mocks.authenticateRequest.mockResolvedValue(apiKeyAuth());

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler });
    const response = await wrapped(makeRequest("/api/v1/management/surveys"), {} as never);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const [callArgs] = handler.mock.calls as unknown as [[{ authentication: { apiKeyId: string } }]];
    // The wrapper hands the handler one object carrying the authenticated context.
    expect(callArgs?.[0]?.authentication).toMatchObject({ apiKeyId: "key-1" });
  });

  test("prefers bearer API keys over session auth on both-auth routes", async () => {
    mocks.authenticateRequest.mockResolvedValue(apiKeyAuth());
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler });
    await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as unknown);

    expect(mocks.authenticateRequest).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  test("returns 401 for management routes without authentication", async () => {
    mocks.getSession.mockResolvedValue(null);

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler });
    const response = await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test("uses unauthenticatedResponse when provided instead of the default 401", async () => {
    mocks.getSession.mockResolvedValue(null);

    const custom = new Response("problem", { status: 401 });
    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({
      handler,
      unauthenticatedResponse: () => custom,
    });
    const response = await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(response).toBe(custom);
  });

  test("applies rate limiting to management routes", async () => {
    mocks.authenticateRequest.mockResolvedValue(apiKeyAuth());

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler });
    await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(mocks.applyRateLimit).toHaveBeenCalled();
  });

  test("surfaces the rate-limit error response when the limiter refuses", async () => {
    mocks.authenticateRequest.mockResolvedValue(apiKeyAuth());
    mocks.applyRateLimit.mockRejectedValue(new Error("too many"));

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler });
    const response = await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(handler).not.toHaveBeenCalled();
    expect([429, 500]).toContain(response.status);
  });

  test("does not allow organization-only API keys by default", async () => {
    mocks.authenticateRequest.mockResolvedValue(null);

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler });
    const response = await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test("allows organization-only API keys when the route opts in", async () => {
    mocks.authenticateRequest.mockResolvedValue(apiKeyAuth({ workspacePermissions: [] }));

    const handler = vi.fn(async () => ({ response: okResponse() }));
    const wrapped = withV1ApiWrapper({ handler, allowOrganizationOnlyApiKey: true });
    const response = await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("reports errors for non-success responses", async () => {
    mocks.authenticateRequest.mockResolvedValue(apiKeyAuth());

    const handler = vi.fn(async () => ({
      response: new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      error: new Error("boom"),
    }));
    const wrapped = withV1ApiWrapper({ handler });
    const response = await wrapped(makeRequest("/api/v1/management/surveys", "POST"), {} as never);

    expect(response.status).toBe(500);
  });
});
