import "server-only";
import { createMcpHandler } from "mcp-handler";
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./constants";
import { mcpRequestStateCodec } from "./request-state";
import { registerResponseTools } from "./tools/responses";
import { registerSurveyTools } from "./tools/surveys";
import { registerWorkspaceTools } from "./tools/workspaces";

/**
 * One options object in v2 (it was three arguments in v1). The v1 handler options are gone rather than
 * moved: `sessionIdGenerator` and `disableSse` because protocol 2026-07-28 removed sessions and the SSE
 * transport outright, and `basePath`/`maxDuration` because the handler now serves whatever route the
 * framework mounts it on - `app/api/mcp/route.ts` is that mount point.
 *
 * Exported so the choices below can be asserted directly. The alternative - reading
 * `createMcpHandler.mock.calls` - cannot work in this repo: `vitestSetup.ts` runs `vi.resetAllMocks()`
 * in a global `beforeEach`, which wipes the import-time call before any test body runs.
 */
export const MCP_HANDLER_OPTIONS = {
  serverInfo: {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  },
  verboseLogs: false,
  // Refuse `subscriptions/listen` outright. Protocol 2026-07-28 replaced the GET SSE endpoint and
  // `resources/subscribe` with a long-lived POST-response stream, which this POST route now serves -
  // under the v1 `disableSse: true` there was no long-lived path at all, so the migration would
  // otherwise open one. We register no resources and emit no list-changed notifications, so such a
  // stream can never deliver anything: a 2026-era client opens one on connect and then holds a
  // connection plus a keepalive timer for nothing. The SDK's default cap is 1024 *per process*, and
  // this handler is a module singleton, so any authenticated caller could hold that many.
  //
  // 0 disables rather than meaning "unlimited": the router gates on `open.size >= maxSubscriptions`
  // and the option is read with `??`, so 0 survives instead of falling back to the default. Verified
  // against the SDK - a listen request comes back `-32603 Subscription limit reached` on plain JSON
  // with the connection closed, instead of a held-open `text/event-stream`.
  //
  // Refusing it is safe for a real 2026-era client, which was the open question: the tested client takes the
  // refusal, goes straight on to `tools/list`, retries the stream three times with exponential backoff
  // (1s/2s/4s), gives up, and calls tools normally. Not fatal, and not a hot loop. If a future client
  // does treat it as fatal, prefer `maxSubscriptions: 1` (accepted but capped) over reverting to the
  // default.
  //
  // Revisit when we actually have something to notify about (resources, or tools that change at
  // runtime); `mcp-handler` 2.1.1 is the version that forwards this option.
  maxSubscriptions: 0,
  /**
   * Integrity for the multi-round-trip `requestState` the delete tools mint.
   *
   * `requestState` round-trips through the client and comes back as attacker-controlled input, and
   * the SDK verifies nothing by default — leaving this unset would hand a handler whatever string
   * the client chose to echo. The hook runs before the handler on every round that carries state, so
   * a forged or expired one is refused at the seam and never reaches a tool.
   *
   * Server-level rather than per-tool because that is where the SDK puts it: one verifier covers
   * every tool that ever mints state, which is also what stops a future tool from forgetting.
   */
  requestState: { verify: mcpRequestStateCodec.verify },
} as const;

export const mcpHandler = createMcpHandler((server) => {
  registerSurveyTools(server);
  registerWorkspaceTools(server);
  registerResponseTools(server);
}, MCP_HANDLER_OPTIONS);
