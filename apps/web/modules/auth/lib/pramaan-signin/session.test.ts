import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { FakePramaan } from "@forms/pramaan/fake";
import * as pramaanModule from "@/lib/pramaan";
import { parseSocialSignInConfig, socialAuthorizationUrl } from "@/modules/auth/lib/pramaan-signin/config";
import {
  attemptSecret,
  decodeAttempt,
  encodeAttempt,
  exchangeCodeForIdentity,
  findOrCreateUserForIdentity,
  newSignInAttempt,
} from "@/modules/auth/lib/pramaan-signin/session";

vi.mock("server-only", () => ({}));
vi.mock("@forms/database", () => ({
  prisma: {
    account: { findFirst: vi.fn() },
    user: { create: vi.fn() },
    session: { create: vi.fn() },
  },
}));
vi.mock("@forms/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/constants", () => ({
  AUTH_SECRET: "test-secret-at-least-32-characters-long",
  WEBAPP_URL: "https://app.example.com",
}));
vi.mock("@/modules/auth/lib/auth-cookies", () => ({ USE_SECURE_COOKIES: true }));
vi.mock("@/lib/pramaan", () => {
  let current: FakePramaan | null = new FakePramaan({});
  return {
    get pramaan() {
      return current;
    },
    unavailableMessage: () => "This feature is not available yet.",
    __setFake(client: FakePramaan | null) {
      current = client;
    },
  };
});

const setFake = (client: FakePramaan | null) => {
  (pramaanModule as unknown as { __setFake: (client: FakePramaan | null) => void }).__setFake(client);
};

beforeEach(() => {
  vi.clearAllMocks();
  setFake(new FakePramaan({}));
});

afterEach(() => {
  setFake(null);
});

describe("social sign-in configuration", () => {
  test("parses the provider list with their application ids", () => {
    expect(parseSocialSignInConfig("google:abc-123.apps.example,github:xyz")).toEqual([
      { key: "google", clientId: "abc-123.apps.example" },
      { key: "github", clientId: "xyz" },
    ]);
  });

  test("is off when unset, blank or malformed", () => {
    expect(parseSocialSignInConfig(undefined)).toEqual([]);
    expect(parseSocialSignInConfig("  ")).toEqual([]);
    expect(parseSocialSignInConfig("google")).toEqual([]);
    expect(parseSocialSignInConfig(" unknown:key")).toEqual([]);
  });

  test("the authorization address carries the app id, redirect, and the one-time values", () => {
    const url = new URL(
      socialAuthorizationUrl(
        { key: "google", clientId: "app-id" },
        "https://app.example.com/api/auth/pramaan/callback/google",
        "state-value-22-chars-long!!",
        "challenge"
      )
    );
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("redirect_uri")).toContain("/api/auth/pramaan/callback/google");
    expect(url.searchParams.get("state")).toBe("state-value-22-chars-long!!");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("the sign-in attempt cookie", () => {
  test("round-trips and expires together", () => {
    const attempt = newSignInAttempt({ providerKey: "google", callbackUrl: "https://app.example.com" });
    const encoded = encodeAttempt(attempt, attemptSecret());
    expect(decodeAttempt(encoded, attemptSecret())).toMatchObject({ providerKey: "google" });
  });

  test("a tampered cookie is no attempt at all", () => {
    const attempt = newSignInAttempt({ providerKey: "google", callbackUrl: "https://app.example.com" });
    const encoded = encodeAttempt(attempt, attemptSecret());
    const tampered = encoded.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(decodeAttempt(tampered, attemptSecret())).toBeNull();
    expect(decodeAttempt(encoded, "another-secret-at-least-32-characters!")).toBeNull();
    expect(decodeAttempt(undefined, attemptSecret())).toBeNull();
  });
});

describe("exchangeCodeForIdentity", () => {
  test("redeems the code for a plain social identity", async () => {
    const fake = pramaanModule.pramaan as FakePramaan;
    fake.route({
      "auth.social.exchange": () => ({
        providerKey: "google",
        subjectId: "subject-1",
        email: "person@example.com",
        emailVerified: true,
        displayName: "Person",
      }),
    });

    const identity = await exchangeCodeForIdentity({
      providerKey: "google",
      code: "one-time-code",
      redirectUri: "https://app.example.com/api/auth/pramaan/callback/google",
      nonce: "nonce-value",
      pkceVerifier: "verifier-value",
    });

    expect(identity).toMatchObject({ providerKey: "google", subjectId: "subject-1", emailVerified: true });
    const request = fake.callsTo("auth.social.exchange")[0] as Record<string, unknown>;
    expect(request.providerKey).toBe("google");
    expect(request.state).toBeUndefined();
    expect(request.expectedNonce).toBe("nonce-value");
  });

  test("an enterprise identity is redeemed only with the state it was started with", async () => {
    const fake = pramaanModule.pramaan as FakePramaan;
    fake.route({
      "auth.social.exchange": () => ({ subjectId: "subject-2", emailVerified: false }),
    });

    await exchangeCodeForIdentity({
      providerKey: "enterprise",
      connectionRef: "ref_1",
      code: "one-time-code",
      redirectUri: "https://app.example.com/api/auth/pramaan/callback/enterprise",
      state: "state-value-22-chars-long!!",
      nonce: "nonce-value",
      pkceVerifier: "verifier-value",
    });

    const request = fake.callsTo("auth.social.exchange")[0] as Record<string, unknown>;
    expect(request.providerKey).toBe("enterprise");
    expect(request.connectionRef).toBe("ref_1");
    expect(request.state).toBe("state-value-22-chars-long!!");
  });
});

describe("findOrCreateUserForIdentity", () => {
  test("finds the user by the identity pair alone", async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValueOnce({
      user: { id: "user-1", email: "found@example.com", name: "Found" },
    } as never);

    const user = await findOrCreateUserForIdentity({
      providerKey: "google",
      subjectId: "subject-1",
      email: "other@example.com",
      emailVerified: true,
    });

    expect(user.id).toBe("user-1");
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { provider: "google", providerAccountId: "subject-1" },
      select: { user: { select: { id: true, email: true, name: true } } },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("an enterprise identity keys on the connection ref plus the subject, never the email", async () => {
    vi.mocked(prisma.account.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: "user-2",
      email: "someone@example.com",
      name: "Someone",
    } as never);

    await findOrCreateUserForIdentity({
      providerKey: "enterprise",
      connectionRef: "ref_1",
      subjectId: "subject-9",
      email: "someone@example.com",
      emailVerified: true,
    });

    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: "saml", providerAccountId: "ref_1:subject-9" },
      })
    );
    // The email is a claim to show, not a lookup key: an existing holder of the
    // address never matches, so a create with that address is the expected path.
    expect(prisma.user.create).toHaveBeenCalled();
  });
});
