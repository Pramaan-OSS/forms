import { beforeEach, describe, expect, test, vi } from "vitest";
import { FakePramaan } from "@forms/pramaan/fake";
import { sessionCookieFor } from "@/modules/auth/lib/pramaan-signin/session";
import { getSessionTokenFromCookieHeader } from "@/modules/auth/lib/session-cookie";
import { openManagedSession } from "./session";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  localUser: vi.fn(),
  admission: vi.fn(),
  domain: vi.fn(),
  invite: vi.fn(),
  complete: vi.fn(),
  session: vi.fn(),
  client: null as FakePramaan | null,
  ready: true,
}));
vi.mock("server-only", () => ({}));
vi.mock("@forms/database", () => ({
  prisma: {
    account: { findFirst: mocks.account },
    user: { create: mocks.create, findUnique: mocks.localUser },
  },
}));
vi.mock("@forms/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("@/lib/pramaan", () => ({
  get pramaan() {
    return mocks.client;
  },
}));
vi.mock("@/lib/constants", () => ({
  WEBAPP_URL: "http://localhost:3036",
  AUTH_SECRET: "test-secret-at-least-32-characters",
  ENCRYPTION_KEY: "1".repeat(64),
}));
vi.mock("@/modules/auth/lib/auth-cookies", () => ({ USE_SECURE_COOKIES: false }));
vi.mock("./backend", () => ({
  managedBackend: () =>
    mocks.ready
      ? { authUrl: "https://signin.example.test/auth", jwksUrl: "https://signin.example.test/keys" }
      : null,
}));
vi.mock("@/modules/auth/lib/signup-policy", () => ({ resolveUninvitedSignupAdmission: mocks.admission }));
vi.mock("@/modules/auth/lib/signup-email-domain", () => ({ isSignupEmailDomainBlocked: mocks.domain }));
vi.mock("@/modules/auth/signup/lib/invite", () => ({ resolveInviteMatch: mocks.invite }));
vi.mock("@/modules/auth/signup/lib/post-registration", () => ({
  completeManagedRegistration: mocks.complete,
}));
vi.mock("@/modules/auth/lib/auth", () => ({
  auth: { $context: Promise.resolve({ internalAdapter: { createSession: mocks.session } }) },
}));
const user = { id: "local-user", email: "person@example.test", name: "Person" };
const token = `e30.${Buffer.from(JSON.stringify({ sub: "user_test", email: user.email, name: user.name, emailVerified: true })).toString("base64url")}.test-signature`;
const request = new Request("http://localhost:3036/api/auth/managed/exchange");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready = true;
  mocks.client = new FakePramaan({
    "auth.token.verify": () => ({ valid: true, userId: "user_test" }),
  });
  mocks.account.mockResolvedValue(null);
  mocks.create.mockResolvedValue(user);
  mocks.localUser.mockResolvedValue({ isActive: true, twoFactorEnabled: false });
  mocks.admission.mockResolvedValue("fresh-instance");
  mocks.domain.mockResolvedValue(false);
  mocks.invite.mockResolvedValue("absent");
  mocks.session.mockResolvedValue({ token: "local-session", expiresAt: new Date(Date.now() + 3600000) });
  mocks.complete.mockResolvedValue(undefined);
});
describe("managed identity to local session", () => {
  test("uses the verified identity, bootstrap policy, normal registration and normal session adapter", async () => {
    expect(await openManagedSession(token, "http://localhost:3036", request)).toMatchObject({
      token: "local-session",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isBootstrapAdmin: "bootstrapAdmin",
          identityProviderAccountId: "managed:https://signin.example.test:user_test",
        }),
      })
    );
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(user.id, user.email, undefined);
    expect(mocks.session).toHaveBeenCalledWith(user.id, false, expect.any(Object));
  });
  test("refused tokens cannot create a user or a session", async () => {
    mocks.client!.route({ "auth.token.verify": () => ({ valid: false }) });
    await expect(openManagedSession("altered-token", "http://localhost:3036", request)).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  test("existing identities may sign in without replaying registration", async () => {
    mocks.account.mockResolvedValue({ user });
    mocks.admission.mockResolvedValue("denied");
    await openManagedSession(token, "http://localhost:3036", request);
    expect(mocks.admission).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  test("closed signup refuses a new identity", async () => {
    mocks.admission.mockResolvedValue("denied");
    await expect(openManagedSession(token, "http://localhost:3036", request)).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  test("the existing email-domain restriction still applies", async () => {
    mocks.domain.mockResolvedValue(true);
    await expect(openManagedSession(token, "http://localhost:3036", request)).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  test.each([
    { isActive: false, twoFactorEnabled: false },
    { isActive: true, twoFactorEnabled: true },
  ])("does not bypass local deactivation or extra verification", async (flags) => {
    mocks.account.mockResolvedValue({ user });
    mocks.localUser.mockResolvedValue(flags);
    await expect(openManagedSession(token, "http://localhost:3036", request)).rejects.toThrow();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  test("does not grant access when the backend is unavailable", async () => {
    mocks.ready = false;
    await expect(openManagedSession(token, "http://localhost:3036", request)).rejects.toThrow();
    expect(mocks.client!.calls).toHaveLength(0);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  test("the returned session cookie is accepted by the existing session reader", () => {
    const cookie = sessionCookieFor("local-session", new Date(Date.now() + 1000));
    expect(getSessionTokenFromCookieHeader(`${cookie.name}=${encodeURIComponent(cookie.value)}`)).toBe(
      "local-session"
    );
    expect(getSessionTokenFromCookieHeader(`${cookie.name}=local-session`)).toBeNull();
  });
});
