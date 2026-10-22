import type { CallToolResult } from "@modelcontextprotocol/server";
import { logger } from "@forms/logger";
import { type TMcpToolContext, getMcpAuthentication, getMcpRequestId, getMcpToolAuthInfo } from "../auth";
import { responseToMcpToolResult } from "../errors";

/**
 * Shared lifecycle for every MCP mutation tool: derive the authentication + request id, run the
 * operation, and map the response to a tool result in exactly one place.
 */
export async function runMcpMutation(
  ctx: TMcpToolContext,
  {
    logContext = {},
  }: {
    logContext?: Record<string, unknown>;
  },
  run: (args: {
    authentication: ReturnType<typeof getMcpAuthentication>;
    requestId: string;
  }) => Promise<Response>
): Promise<CallToolResult> {
  const authInfo = getMcpToolAuthInfo(ctx);
  const requestId = getMcpRequestId(authInfo);
  const authentication = getMcpAuthentication(authInfo);
  logger.withContext({ requestId, ...logContext });

  const response = await run({ authentication, requestId });
  return await responseToMcpToolResult(response, requestId);
}
