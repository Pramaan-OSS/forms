import "server-only";
import { createHash } from "node:crypto";
import { logger } from "@forms/logger";
import { PramaanError, safeActionFailureReason } from "@forms/pramaan";
import { pramaan } from "@/lib/pramaan";
import { managedBackend } from "./backend";

/** Called by the existing confirmed-deletion hook, after the sole-owner guard. */
export async function deleteManagedUser(accountId: unknown, localUserId: string): Promise<void> {
  if (typeof accountId !== "string" || !accountId.startsWith("managed:")) return;
  const backend = managedBackend();
  if (!backend || !pramaan) throw new Error("Managed account deletion could not be confirmed.");
  const prefix = `managed:${new URL(backend.authUrl).origin}:`;
  const userId = accountId.slice(prefix.length);
  if (!accountId.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,128}$/.test(userId))
    throw new Error("Managed account deletion could not be confirmed.");
  try {
    await pramaan.call(
      "auth.user.delete",
      { userId, confirm: true },
      {
        idempotencyKey: createHash("sha256")
          .update(`delete-managed-user:${localUserId}:${userId}`)
          .digest("hex"),
      }
    );
  } catch (error) {
    if (error instanceof PramaanError && error.code === "not_found") return;
    logger.error({ reason: safeActionFailureReason(error) }, "Managed account deletion was refused");
    throw new Error("Managed account deletion could not be confirmed.");
  }
}
