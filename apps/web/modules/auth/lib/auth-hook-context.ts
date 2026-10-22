import type { createAuthMiddleware } from "better-auth/api";

/**
 * The context Better Auth hands to `hooks.before` / `hooks.after` middleware.
 * Better Auth does not export this shape, so it is derived from its own
 * middleware signature.
 */
export type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
