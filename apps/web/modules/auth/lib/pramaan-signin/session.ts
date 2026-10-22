import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@forms/database";
import type { IdentityProvider } from "@forms/database/prisma";
import { logger } from "@forms/logger";
import { AUTH_SECRET } from "@/lib/constants";
import { pramaan, unavailableMessage } from "@/lib/pramaan";
import { USE_SECURE_COOKIES } from "@/modules/auth/lib/auth-cookies";
import type { SignInAttempt } from "./attempt";
import { decodeAttempt, newSignInAttempt } from "./attempt";

export { SOCIAL_SIGN_IN_COOKIE } from "./config";
export type { SocialProviderKey } from "./config";
export { codeChallengeOf } from "./attempt";

/**
 * Turn a platform-verified identity into this app's own user and session.
 *
 * The identity is the pair (provider or enterprise connection, subjectId) and
 * nothing else. The email address is a claim to show: an address is never a
 * key to find or link an account, whatever its verified flag says — the
 * provider that asserted it is run by somebody else.
 */

const SESSION_DAYS = 7;
const SESSION_COOKIE = `${USE_SECURE_COOKIES ? "__Secure-" : ""}forms.session_token`;

export interface VerifiedIdentity {
  readonly providerKey: string;
  readonly connectionRef?: string;
  readonly subjectId: string;
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly displayName?: string;
}

/** The identity provider enum value a social key or an enterprise connection maps to. */
const identityProviderOf = (identity: VerifiedIdentity): IdentityProvider => {
  if (identity.connectionRef) return "saml";
  switch (identity.providerKey) {
    case "google":
      return "google";
    case "github":
      return "github";
    // The enterprise directory protocols and the remaining platforms land here.
    default:
      return "openid";
  }
};

/** The app's own key for an outside identity: the provider plus the subject, never the email. */
const providerAccountIdOf = (identity: VerifiedIdentity): string =>
  identity.connectionRef ? `${identity.connectionRef}:${identity.subjectId}` : identity.subjectId;

export const exchangeCodeForIdentity = async (
  input: {
    code: string;
    redirectUri: string;
  } & Pick<SignInAttempt, "providerKey" | "connectionRef" | "nonce" | "pkceVerifier"> & {
      /** Compared by the platform for enterprise sign-in; never sent for plain social. */
      readonly state?: string;
    }
): Promise<VerifiedIdentity> => {
  if (!pramaan) throw new Error(unavailableMessage(new Error("not-configured")));
  // The platform reply carries a short-lived pictureUrl; this app persists no
  // picture column and never reads one, so the value is dropped here on purpose.
  const result = (await pramaan.call("auth.social.exchange", {
    // Enterprise sign-in only with connectionRef; the platform refuses a state on plain social.
    ...(input.connectionRef
      ? {
          providerKey: "enterprise",
          connectionRef: input.connectionRef,
          state: input.state,
          pkceVerifier: input.pkceVerifier,
          expectedNonce: input.nonce,
        }
      : {
          providerKey: input.providerKey,
          pkceVerifier: input.pkceVerifier,
          expectedNonce: input.nonce,
        }),
    code: input.code,
    redirectUri: input.redirectUri,
  })) as {
    subjectId?: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
  };

  if (!result?.subjectId) {
    throw new Error("The sign-in reply carried no identity.");
  }
  return {
    providerKey: input.providerKey,
    ...(input.connectionRef ? { connectionRef: input.connectionRef } : {}),
    subjectId: result.subjectId,
    email: result.email,
    emailVerified: result.emailVerified === true,
    displayName: result.displayName,
  };
};

/** The user for this identity, found by the identity pair alone, or created. */
export const findOrCreateUserForIdentity = async (
  identity: VerifiedIdentity,
  options?: {
    beforeCreate?: () => Promise<{ isBootstrapAdmin?: "bootstrapAdmin" }>;
    afterCreate?: (user: { id: string; email: string; name: string }) => Promise<void>;
  }
): Promise<{ id: string; email: string; name: string }> => {
  const provider = identityProviderOf(identity);
  const providerAccountId = providerAccountIdOf(identity);

  const existingAccount = await prisma.account.findFirst({
    where: { provider, providerAccountId },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (existingAccount?.user) return existingAccount.user;

  // No account for this identity yet. The email is only usable as a label: a new
  // user is created even when someone else already holds that address.
  const name = identity.displayName?.trim() || identity.email?.split("@")[0] || "New user";
  const email = identity.email ?? `${providerAccountId}@users-noreply.pramaan.dev`;
  const admission = await options?.beforeCreate?.();
  const user = await prisma.user.create({
    data: {
      ...admission,
      name,
      email,
      emailVerified: identity.emailVerified,
      identityProvider: provider,
      identityProviderAccountId: providerAccountId,
      accounts: {
        create: {
          provider,
          providerAccountId,
          type: "oauth",
        },
      },
    },
    select: { id: true, email: true, name: true },
  });
  await options?.afterCreate?.(user);
  logger.info({ userId: user.id, provider }, "Signed in with a platform-verified identity");
  return user;
};

/** One app session for the signed-in identity, as a row and as the response cookie. */
export const startAppSession = async (
  userId: string,
  request: Request
): Promise<{ token: string; expiresAt: Date }> => {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1_000);
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId,
      expires: expiresAt,
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        null,
      userAgent: request.headers.get("user-agent"),
    },
    select: { id: true },
  });
  return { token, expiresAt };
};

export const sessionCookieFor = (token: string, expiresAt: Date) => ({
  name: SESSION_COOKIE,
  value: `${token}.${createHmac("sha256", attemptSecret()).update(token).digest("base64")}`,
  attributes: {
    httpOnly: true,
    sameSite: "lax",
    secure: USE_SECURE_COOKIES,
    path: "/",
    expires: expiresAt,
  } as const,
});

/** The attempt cookie's signing secret is the instance's auth secret. */
export const attemptSecret = (): string => {
  if (!AUTH_SECRET) throw new Error("The instance has no auth secret configured.");
  return AUTH_SECRET;
};

export { decodeAttempt, newSignInAttempt };
export type { SignInAttempt };
export { encodeAttempt } from "./attempt";
