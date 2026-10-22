"use client";
import { createAuthClient } from "better-auth/client";

/** The browser talks only to the provisioned sign-in backend for its own account. */
export const managedClient = (authUrl: string) =>
  createAuthClient({ baseURL: authUrl, fetchOptions: { credentials: "include" } });

export async function managedSessionToken(client: ReturnType<typeof managedClient>): Promise<string> {
  const result = await client.$fetch<{ token: string }>("/token", { method: "GET" });
  const token = result.data?.token;
  if (result.error || !token || token.split(".").length !== 3)
    throw new Error("Sign-in could not be verified.");
  return token;
}
