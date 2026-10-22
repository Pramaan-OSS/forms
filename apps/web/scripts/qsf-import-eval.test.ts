import { spawn } from "node:child_process";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const tsxExecutable = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));

/**
 * A provider that refuses every call with a 401: the eval reaches it only once every module it imports
 * has loaded, and a 401 is not retried, so the run ends at once.
 */
const startRefusingProvider = async (): Promise<{ server: Server; port: number; calls: string[] }> => {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    calls.push(request.url ?? "");
    request.resume();
    request.on("end", () => {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "unauthorized", type: "invalid_request_error" } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port, calls };
};

const runEval = (port: number, args: ReadonlyArray<string>) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      tsxExecutable,
      ["scripts/run-esm-script.mts", "scripts/qsf-import-eval.ts", ...args],
      {
        cwd: webRoot,
        env: {
          ...process.env,
          PRAMAAN_API_KEY: "eval-key",
          PRAMAAN_FAKE: "0",
          PRAMAAN_BASE_URL: `http://127.0.0.1:${port}`,
          LOG_LEVEL: "fatal",
          NODE_OPTIONS: "--conditions=react-server",
        },
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });

describe("pnpm qsf:eval", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;
  });

  test(
    "loads the app as ES modules, ESM-only packages included, and reaches the provider",
    { timeout: 60_000 },
    async () => {
      const provider = await startRefusingProvider();
      server = provider.server;

      const result = await runEval(provider.port, ["--fixture=simple"]);

      // The generation call reaches the platform key's base URL, wherever it points.
      expect(result.stderr).not.toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
      expect(provider.calls).toEqual(["/v1/capabilities/llm.complete"]);
      expect(result.status).toBe(1);
      // The run's line names the refusal's fixed code, and nothing of its message.
      const lines = result.stdout
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(lines).toEqual([{ run: 1, fixture: "simple.qsf", failed: "PramaanError" }]);
    }
  );
});
