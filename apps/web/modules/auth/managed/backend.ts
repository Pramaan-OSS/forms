import "server-only";
import type { ManagedSignInBackend } from "@forms/pramaan/managed-runtime";
import { env } from "@/lib/env";

export function managedBackend(): ManagedSignInBackend | null {
  if (!env.PRAMAAN_API_KEY || !env.FORMS_MANAGED_AUTH_URL || !env.FORMS_MANAGED_JWKS_URL) return null;
  return { authUrl: env.FORMS_MANAGED_AUTH_URL, jwksUrl: env.FORMS_MANAGED_JWKS_URL };
}
