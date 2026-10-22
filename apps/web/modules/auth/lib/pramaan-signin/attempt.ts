import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The one-time values of a sign-in (state, nonce, PKCE verifier), kept in the
 * visitor's own session as one signed HttpOnly cookie. The signature is an
 * HMAC over the payload with the instance's auth secret, so a visitor cannot
 * mint values for a sign-in they did not start. Everything expires together.
 */

const TEN_MINUTES_MS = 10 * 60 * 1_000;

export interface SignInAttempt {
  /** The provider key, or the enterprise connection's ref. */
  readonly providerKey: string;
  /** Present for enterprise sign-in only. */
  readonly connectionRef?: string;
  readonly state: string;
  readonly nonce: string;
  readonly pkceVerifier: string;
  /** Where to send the person after the sign-in completes. */
  readonly callbackUrl: string;
  readonly issuedAt: number;
}

export const newSignInAttempt = (input: {
  providerKey: string;
  connectionRef?: string;
  callbackUrl: string;
}): SignInAttempt => ({
  providerKey: input.providerKey,
  ...(input.connectionRef ? { connectionRef: input.connectionRef } : {}),
  state: randomBytes(24).toString("base64url"),
  nonce: randomBytes(24).toString("base64url"),
  pkceVerifier: randomBytes(48).toString("base64url"),
  callbackUrl: input.callbackUrl,
  issuedAt: Date.now(),
});

export const codeChallengeOf = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

const sign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export const encodeAttempt = (attempt: SignInAttempt, secret: string): string => {
  const payload = Buffer.from(JSON.stringify(attempt)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
};

/** Verifies the signature, then the age. A tampered or stale cookie is no attempt at all. */
export const decodeAttempt = (cookie: string | undefined, secret: string): SignInAttempt | null => {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const attempt = JSON.parse(Buffer.from(payload, "base64url").toString()) as SignInAttempt;
    if (typeof attempt.state !== "string" || typeof attempt.nonce !== "string") return null;
    if (Date.now() - attempt.issuedAt > TEN_MINUTES_MS) return null;
    return attempt;
  } catch {
    return null;
  }
};
