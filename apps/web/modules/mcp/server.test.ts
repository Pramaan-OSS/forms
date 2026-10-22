import { describe, expect, test, vi } from "vitest";
import { mcpRequestStateCodec } from "./request-state";
import { MCP_HANDLER_OPTIONS } from "./server";

vi.mock("server-only", () => ({}));

vi.mock("mcp-handler", () => ({
  createMcpHandler: vi.fn(() => vi.fn()),
}));

vi.mock("./tools/feedback-records", () => ({ registerFeedbackRecordTools: vi.fn() }));
vi.mock("./tools/responses", () => ({ registerResponseTools: vi.fn() }));
vi.mock("./tools/surveys", () => ({ registerSurveyTools: vi.fn() }));
vi.mock("./tools/workflows", () => ({ registerWorkflowTools: vi.fn() }));
vi.mock("./tools/workspaces", () => ({ registerWorkspaceTools: vi.fn() }));

const mocks = vi.hoisted(() => ({
  getMcpAuthentication: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("./auth", () => ({
  getMcpAuthentication: mocks.getMcpAuthentication,
}));

vi.mock("@forms/logger", () => ({
  logger: { warn: mocks.loggerWarn },
}));

describe("mcpHandler options", () => {
  /**
   * Pins the declared value only. The behaviour it produces — a `subscriptions/listen` request refused with
   * `-32603 Subscription limit reached` instead of being accepted and held open — is covered end to end
   * through the real route in `app/api/mcp/route.test.ts`, which is what proves the option reaches the SDK.
   *
   * Kept alongside it because the two fail differently and both are useful: this one names the intended
   * value at the place it is declared, and fails fast and legibly if it changes; the route test fails on a
   * timeout, since removing the cap means the stream is accepted rather than rejected.
   */
  test("declares subscription streams as refused", () => {
    expect(MCP_HANDLER_OPTIONS.maxSubscriptions).toBe(0);
  });

  /**
   * The option is the whole of the "a forged `requestState` never reaches a handler" guarantee: the
   * SDK verifies nothing by default, so leaving it unset hands every handler whatever string the
   * client echoed. Nothing else asserted it — removing the line left all of `modules/mcp` green.
   *
   * Pinned by identity rather than by shape. A verifier that is merely *a function* is the failure
   * this cannot be allowed to pass: the point is that it is the codec's own, so a hand-rolled or
   * permissive stand-in fails here.
   */
  test("declares the request-state verifier, and it is the codec's own", () => {
    expect(MCP_HANDLER_OPTIONS.requestState.verify).toBe(mcpRequestStateCodec.verify);
  });
});
