import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { prisma } from "@forms/database";
import { deleteUserOrganizationRelationships } from "@/lib/authzed/organization-membership";
import { runPostCommitProjection } from "@/lib/authzed/projection-boundary";
import { deleteUserTeamRelationships } from "@/lib/authzed/team-workspace";
import { deleteOrganization, getOrganizationsWhereUserIsSingleOwner } from "@/lib/organization/service";
import { ACCOUNT_DELETION_SOLE_OWNER_BLOCK_MESSAGE } from "@/modules/account/constants";
import type { AuthHookContext } from "@/modules/auth/lib/auth";
import { deleteManagedUser } from "@/modules/auth/managed/user-lifecycle";

type DeleteUserConfig = NonNullable<NonNullable<BetterAuthOptions["user"]>["deleteUser"]>;

/**
 * Better Auth `user.deleteUser` config (ENG-1054, design doc §14) — re-expresses Forms' account
 * deletion on Better Auth's native flow, replacing the prior bespoke SSO IdP re-authentication.
 *
 * The confirmation friction is asymmetric and lives at the edges (Phase 6, not here): credential users
 * confirm with their password (Better Auth verifies it before `beforeDelete`); SSO users confirm via an
 * email link (a server action mints a `delete-account-<token>` verification value that Better Auth's
 * native `GET /delete-user/callback` consumes). The global `sendDeleteAccountVerification` is
 * intentionally NOT set in auth.ts — it would email credential users too.
 *
 * The hooks below run for BOTH paths and only get `(user, request)`, so everything is derived from
 * `user.id` / `user.email`. The DeleteAccountModal drives this flow (credential users call
 * `authClient.deleteUser`; SSO users go through the email-link request action). The `[...all]` route is
 * mounted, so the deletion endpoints are live.
 */

/**
 * Pre-delete steps that do NOT cascade from the `User` row — mirrors `lib/user/service.ts deleteUser`
 * plus the single-org guard the prior account-deletion path enforced:
 *  - Block deletion on single-org instances when the user is the sole owner of any organization
 *    (it would be orphaned) — they must transfer ownership first.
 *  - Otherwise delete the organizations they solely own (only reachable in the multi-org case) and
 *    the invites they created.
 * The user, sessions, accounts, and memberships are removed by Better Auth's deleteUser + the same
 * Prisma cascade `deleteUserById` relies on, so they need no explicit handling here.
 */
export const accountDeletionBeforeDelete: NonNullable<DeleteUserConfig["beforeDelete"]> = async (user) => {
  const soleOwnerOrganizations = await getOrganizationsWhereUserIsSingleOwner(user.id);

  if (soleOwnerOrganizations.length > 0) {
    throw new APIError("BAD_REQUEST", {
      message: ACCOUNT_DELETION_SOLE_OWNER_BLOCK_MESSAGE,
    });
  }

  try {
    const identity = await prisma.user.findUnique({
      where: { id: user.id },
      select: { identityProviderAccountId: true },
    });
    await deleteManagedUser(identity?.identityProviderAccountId, user.id);
  } catch {
    throw new APIError("BAD_REQUEST", {
      message: "Managed account deletion could not be confirmed. Try again later.",
    });
  }
  for (const organization of soleOwnerOrganizations) {
    await deleteOrganization(organization.id);
  }
  await prisma.invite.deleteMany({ where: { creatorId: user.id } });
};

/**
 * Post-delete cleanup (the user row is already gone) — mirrors the tail of the deleteUser service.
 */
export const accountDeletionAfterDelete: NonNullable<DeleteUserConfig["afterDelete"]> = async (user) => {
  await runPostCommitProjection("account_delete_organization_cleanup", () =>
    deleteUserOrganizationRelationships(user.id)
  );
  await runPostCommitProjection("account_delete_team_cleanup", () => deleteUserTeamRelationships(user.id));
};

export const accountDeletionConfig = {
  enabled: true,
  beforeDelete: accountDeletionBeforeDelete,
  afterDelete: accountDeletionAfterDelete,
} satisfies DeleteUserConfig;

/**
 * `hooks.before` guard for `POST /delete-user` (ENG-1054, S1). Better Auth verifies the password only
 * when one is sent; otherwise it allows deletion on session freshness alone (the `freshAge` window), so
 * a credential user with a recent session could delete their account without re-confirming the
 * password. We require an explicit confirmation factor — the password (credential users) or a deletion
 * token — on the POST entry point. The credential DeleteAccountModal always sends the password and SSO
 * users delete via the emailed `GET /delete-user/callback` (which carries its own token), so a real
 * client never trips this; it's defense in depth against a direct API call. Better Auth still verifies
 * whichever factor is supplied.
 */
export const requireDeletionConfirmationBeforeHandler = async (ctx: AuthHookContext): Promise<void> => {
  if (ctx.path !== "/delete-user") return;

  const body = ctx.body as { password?: unknown; token?: unknown } | undefined;
  if (body?.password || body?.token) return; // Better Auth verifies the supplied factor

  throw new APIError("BAD_REQUEST", {
    message: "Password confirmation is required to delete your account.",
  });
};
