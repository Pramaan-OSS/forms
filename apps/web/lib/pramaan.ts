import "server-only";
import { type Pramaan, createPramaan, unavailableMessage } from "@forms/pramaan";
import { env } from "@/lib/env";

/**
 * The app's single Pramaan client. Every outside call in apps/web goes
 * through here (packages read the key through their own module, which reads
 * the same two variables). Null when no key is configured: callers then show
 * the one plain "not available yet" message instead of attempting a call.
 */
export const pramaan: Pramaan | null = env.PRAMAAN_API_KEY
  ? createPramaan({
      apiKey: env.PRAMAAN_API_KEY,
      baseUrl: env.PRAMAAN_BASE_URL,
    })
  : null;

/** True when a key is configured. */
export const pramaanConfigured = Boolean(env.PRAMAAN_API_KEY);

export { unavailableMessage };
