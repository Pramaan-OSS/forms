import { beforeEach, describe, expect, test, vi } from "vitest";
import { getBetterAuthRequestContext } from "@/modules/auth/lib/better-auth-request-context";
import { GET, POST } from "./route";

// Mock the BA instance + the innermost request-context wrapper so the route's delegation can be
// asserted without the real auth graph. Here we assert the route runs `auth.handler` INSIDE
// `runWithEmailVerificationRequestContext` for both verbs.
//
// The observability context (`better-auth-request-context` + `better-auth-path-label`) is deliberately
// NOT mocked: what needs proving is that this route wires them correctly, and a mock of either would
// assert the test's own arrangement instead. `api` mirrors the shape route.ts reads the label
// vocabulary from — each endpoint function carries its declared path.
const { handlerMock, runWithCtxMock } = vi.hoisted(() => ({
  // Parameter declared even though the body ignores it: `mock.calls` is typed from the signature, so
  // without it `calls[0]` is a zero-length tuple and every `calls[0][0]` read below is a type error.
  handlerMock: vi.fn(async (_request: Request) => new Response("ok", { status: 200 })),
  runWithCtxMock: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("@/modules/auth/lib/auth", () => ({
  auth: {
    handler: handlerMock,
    api: {
      getSession: { path: "/get-session" },
      signInEmail: { path: "/sign-in/email" },
      resetPassword: { path: "/reset-password" },
      resetPasswordCallback: { path: "/reset-password/:token" },
      // A nullish entry, deliberately. The label vocabulary is built at MODULE LOAD from this object,
      // so `endpoint.path` on a null would throw there and take down every `/api/auth/*` request — the
      // route, not just the tag. Importing this file at all is what asserts it does not.
      nullishEndpoint: null,
    },
  },
}));
vi.mock("@/modules/auth/lib/email-verification-request-context", () => ({
  runWithEmailVerificationRequestContext: runWithCtxMock,
}));

// NOTE on assertions below: a Request must never be asserted with `toHaveBeenCalledWith`. Request state
// lives in internal slots, so it has no own properties and ANY two Request objects compare deep-equal
// under vitest — such an assertion passes even when the handler was called with a completely different
// URL. Assert identity (`toBe`) for pass-through, and read `.url` off the recorded call for a rewrite.
describe("[...all] Better Auth route (ENG-1054 cutover)", () => {
  beforeEach(() => {
    handlerMock.mockClear();
    runWithCtxMock.mockClear();
  });

  test("GET delegates to auth.handler within the request context", async () => {
    const request = new Request("http://localhost/api/auth/get-session");
    // Record ordering so we prove auth.handler runs INSIDE the wrapper (not merely that both ran).
    const calls: string[] = [];
    runWithCtxMock.mockImplementationOnce(async (fn: () => unknown) => {
      calls.push("wrapper:start");
      const response = await fn();
      calls.push("wrapper:end");
      return response;
    });
    handlerMock.mockImplementationOnce(async () => {
      calls.push("handler");
      return new Response("ok", { status: 200 });
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(runWithCtxMock).toHaveBeenCalledTimes(1);
    expect(handlerMock.mock.calls[0][0]).toBe(request);
    expect(calls).toEqual(["wrapper:start", "handler", "wrapper:end"]);
  });

  test("POST delegates to auth.handler within the request context", async () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", { method: "POST" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(runWithCtxMock).toHaveBeenCalledTimes(1);
    expect(handlerMock.mock.calls[0][0]).toBe(request);
  });

  test("GET and POST share the single wrapped handler", () => {
    expect(GET).toBe(POST);
  });
});

// ENG-2259: the error log in better-auth-observability.ts reads this context, so if the route
// stops opening it the fault reports with no endpoint again — exactly the state that left
// FORMS-183 untriageable at ~242 events.
describe("[...all] Better Auth route — observability context (ENG-2259)", () => {
  beforeEach(() => {
    handlerMock.mockClear();
    runWithCtxMock.mockClear();
  });

  const captureContextDuringHandler = async (request: Request) => {
    let seen: ReturnType<typeof getBetterAuthRequestContext>;
    handlerMock.mockImplementationOnce(async () => {
      seen = getBetterAuthRequestContext();
      return new Response("ok", { status: 200 });
    });
    await POST(request);
    return seen;
  };

  test("exposes the endpoint label and method to the handler", async () => {
    const seen = await captureContextDuringHandler(
      new Request("http://localhost/api/auth/sign-in/email", { method: "POST" })
    );

    expect(seen).toEqual({ path: "/sign-in/email", method: "POST" });
  });

  test("never exposes the token from /reset-password/:token", async () => {
    const token = "faketokenfaketokenfaketoken00001";

    const seen = await captureContextDuringHandler(
      new Request(`http://localhost/api/auth/reset-password/${token}`, { method: "POST" })
    );

    // The endpoint is still identified; the credential in its path is not carried anywhere.
    expect(seen).toEqual({ path: "/reset-password/*", method: "POST" });
    expect(JSON.stringify(seen)).not.toContain(token);
  });
});

/**
 * The DCR redirect-URI allowlist (ENG-3086). `prepareDcrRequest` is the real implementation here, so
 * these prove the route wires it: a non-loopback registration is rejected before `auth.handler` runs,
 * and a loopback one is still delegated (with the application_type inference applied to its body).
 */
describe("[...all] Better Auth route — DCR redirect-URI allowlist (ENG-3086)", () => {
  beforeEach(() => {
    handlerMock.mockClear();
    runWithCtxMock.mockClear();
  });

  test("rejects a non-loopback registration without delegating to auth.handler", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["https://attacker-controlled-test.example.org/cb"] }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_redirect_uri" });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(runWithCtxMock).not.toHaveBeenCalled();
  });

  test("delegates a loopback registration to auth.handler with the inferred type", async () => {
    await POST(
      new Request("http://localhost/api/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:33418/callback"] }),
      })
    );

    expect(handlerMock).toHaveBeenCalledTimes(1);
    const handled = handlerMock.mock.calls[0][0];
    expect(handled.url).toBe("http://localhost/api/auth/oauth2/register");
    await expect(handled.json()).resolves.toMatchObject({ application_type: "native" });
  });
});
