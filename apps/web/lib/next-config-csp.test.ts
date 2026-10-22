import type { NextConfig } from "next";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// Guards the explicit `worker-src` in the CSP: without it browsers fall back to `script-src`, which
// has no `blob:`, so any `blob:` worker (survey bundles use them) is blocked on every page and a
// console error is the only sign. Asserted on the `headers()` output rather than the source, so every
// rule that sets a CSP is covered, including any added later.

// next.config.mjs validates the app env when it is imported. These are the vars with no default; CI
// blanks REDIS_URL in its .env, so they are stubbed rather than read from the environment.
const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/forms",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  CUBEJS_API_SECRET: "test-cubejs-secret",
  CUBEJS_API_URL: "http://localhost:4000",
  HUB_API_URL: "http://localhost:8080",
  HUB_API_KEY: "test-hub-key",
  REDIS_URL: "redis://localhost:6379",
};

let nextConfig: NextConfig;

const getWorkerSources = (csp: string): string[] | undefined => {
  const directive = csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === "worker-src");
  return directive?.slice(1);
};

describe("CSP lets blob: workers start", () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries(REQUIRED_ENV)) {
      vi.stubEnv(name, value);
    }
    nextConfig = (await import("../next.config.mjs")).default;
  }, 30_000);

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  test("development preserves the source tree", () => {
    expect(nextConfig.agentRules).toBe(false);
  });

  test("local source startup skips the deployment archive while release builds retain it", async () => {
    for (const flag of [undefined, "1"]) {
      vi.resetModules();
      vi.stubEnv("FORMS_LOCAL_START", flag);
      const config = (await import("../next.config.mjs")).default;
      expect(config.output).toBe(flag === "1" ? undefined : "standalone");
    }
    vi.stubEnv("FORMS_LOCAL_START", undefined);
  });

  test.each(["production", "development"])("every CSP allows blob: workers in %s", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);

    const rules = (await nextConfig.headers?.()) ?? [];
    const policies = rules.flatMap((rule) =>
      rule.headers
        .filter((header) => header.key === "Content-Security-Policy")
        .map((header) => ({ source: rule.source, workerSources: getWorkerSources(header.value) }))
    );

    // The app routes and the embeddable /s/ and /c/ survey routes each set their own CSP.
    expect(policies.length).toBeGreaterThanOrEqual(2);
    for (const { source, workerSources } of policies) {
      expect(workerSources, `CSP for ${source}`).toEqual(expect.arrayContaining(["'self'", "blob:"]));
    }
  });
});
