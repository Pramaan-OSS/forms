import "server-only";
import { prisma } from "@forms/database";
import { verifyManagedToken } from "@forms/pramaan/managed-runtime";
import { WEBAPP_URL } from "@/lib/constants";
import { pramaan } from "@/lib/pramaan";
import { getInviteTokenFromCallbackUrl } from "@/modules/auth/lib/callback-url";
import { findOrCreateUserForIdentity } from "@/modules/auth/lib/pramaan-signin/session";
import { isSignupEmailDomainBlocked } from "@/modules/auth/lib/signup-email-domain";
import { resolveUninvitedSignupAdmission } from "@/modules/auth/lib/signup-policy";
import { resolveInviteMatch } from "@/modules/auth/signup/lib/invite";
import { managedBackend } from "./backend";

export async function openManagedSession(token: string, callbackUrl: string, request: Request) {
  const backend = managedBackend();
  if (!backend || !pramaan) throw new Error("Managed sign-in is unavailable.");
  const identity = await verifyManagedToken(pramaan, backend, token, WEBAPP_URL);
  const inviteToken = getInviteTokenFromCallbackUrl(callbackUrl, WEBAPP_URL) || undefined;
  const user = await findOrCreateUserForIdentity(identity, {
    beforeCreate: async () => {
      const match = await resolveInviteMatch(inviteToken, identity.email);
      if (inviteToken && (match !== "valid" || !identity.emailVerified))
        throw new Error("Sign-up is not allowed.");
      const admission = match === "valid" ? "open" : await resolveUninvitedSignupAdmission();
      if (
        admission === "denied" ||
        (await isSignupEmailDomainBlocked(identity.email, async () => match === "valid"))
      )
        throw new Error("Sign-up is not allowed.");
      return admission === "fresh-instance" ? { isBootstrapAdmin: "bootstrapAdmin" } : {};
    },
    afterCreate: async (created) => {
      const { completeManagedRegistration } = await import("@/modules/auth/signup/lib/post-registration");
      await completeManagedRegistration(created.id, created.email, inviteToken);
    },
  });
  const localUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isActive: true, twoFactorEnabled: true },
  });
  if (!localUser?.isActive || localUser.twoFactorEnabled)
    throw new Error("Use your existing sign-in method to complete account verification.");
  // Use the normal adapter so local session hooks, database storage and cache all apply.
  const { auth } = await import("@/modules/auth/lib/auth");
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(user.id, false, {
    userAgent: request.headers.get("user-agent") ?? "",
  });
  if (!session?.token) throw new Error("Sign-in did not complete.");
  return { token: session.token, expiresAt: new Date(session.expiresAt) };
}
