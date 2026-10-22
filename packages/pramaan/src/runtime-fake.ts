import { assertActionKey } from "./action-policy";

/** Offline fixtures enabled only by the explicit PRAMAAN_FAKE=1 test switch. */
export const runtimeFakeFetch = async (url: string, init: RequestInit): Promise<Response> => {
  const endpoint = new URL(url).pathname;
  const id = decodeURIComponent(endpoint.split("/").pop() ?? "");
  try {
    assertActionKey(id, new Headers(init.headers).get("Idempotency-Key"));
  } catch (error) {
    return Response.json(
      { error: { code: "invalid_request", message: (error as Error).message } },
      { status: 400 }
    );
  }
  const input = JSON.parse(String(init.body ?? "{}")) as Record<string, any>;
  const app = String(input.app ?? "googlesheets");
  const fixtures: Record<string, unknown> = {
    "auth.backend.provision": {
      status: "ready",
      authUrl: "https://signin.example.test/auth",
      jwksUrl: "https://signin.example.test/auth/keys",
    },
    "auth.backend.domains.set": {
      allowedDomains: (input.domains ?? []).map((domain: string) => ({ domain })),
    },
    "auth.token.verify":
      input.token ===
      "eyJ0ZXN0Ijp0cnVlfQ.eyJzdWIiOiJvZmZsaW5lLXVzZXIiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUudGVzdCIsImVtYWlsVmVyaWZpZWQiOnRydWUsIm5hbWUiOiJMb2NhbCBhZG1pbmlzdHJhdG9yIn0.offline-signature"
        ? {
            valid: true,
            userId: "offline-user",
            sessionId: "offline-session",
            orgId: null,
            expiresAt: "2099-01-01T00:00:00Z",
          }
        : { valid: false },
    "auth.user.delete": { deleted: true },
    "auth.enterprise-connections.list": { results: [] },
    "apps.connections.list": { results: [{ app, status: "active" }] },
    "apps.catalog.search": {
      results: [
        {
          app,
          action: `test.${app}.append`,
          description: "Append a response (test mode)",
          inputSchema: {
            type: "object",
            required: ["destination", "values"],
            properties: { destination: { type: "string" }, values: { type: "object" } },
          },
        },
      ],
    },
    "apps.action.execute": { status: "succeeded", output: { testMode: true } },
    "email.send": { id: "test-message", status: "sent" },
    "text.sentiment.analyze": { sentiment: "neutral", confidence: 1 },
    "text.language.detect": { language: "en", confidence: 1 },
    "text.translate": { text: `[${input.targetLanguage}] ${input.text}` },
    "auth.bot-check.verify": { passed: true },
    "image.search": {
      results: [
        {
          imageUrl: `${process.env.WEBAPP_URL || "http://localhost:3036"}/image-backgrounds/plant.webp`,
          pageUrl: "/",
          title: "Local test image",
        },
      ],
    },
  };
  if (endpoint === "/v1/outcomes/content.localize")
    return Response.json({
      outcome: "content.localize",
      version: 1,
      plan: "test",
      status: "done",
      completeness: "complete",
      result: {
        translations: (input.input?.languages ?? []).map((language: string) => ({
          language,
          text: `[${language}] ${input.input.text}`,
          notes: "Offline test translation.",
        })),
      },
      evidence: {},
      missing: [],
      steps: [],
      cost: { hold_micro: 0, charged_micro: 0, capabilities: [] },
    });
  if (id in fixtures) return Response.json(fixtures[id]);
  return Response.json(
    { error: { code: "upstream_unavailable", message: "This feature is not available in test mode." } },
    { status: 503 }
  );
};
