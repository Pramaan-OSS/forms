import "server-only";
import { logger } from "@forms/logger";
import { INVITE_TOKEN_INVALID_ERROR_CODE, InvalidInputError } from "@forms/types/errors";
import type { TUser } from "@forms/types/user";
import { verifyInviteToken } from "@/lib/jwt";
import { createMembership } from "@/lib/membership/service";
import { createOrganization } from "@/lib/organization/service";
import { getUserByEmail } from "@/lib/user/service";
import { DEFAULT_WORKSPACE_NAME } from "@/lib/workspace/constants";
import { updateUser } from "@/modules/auth/lib/user";
import { sendInviteAcceptedEmail } from "@/modules/email";
import { createWorkspace } from "@/modules/workspaces/settings/lib/workspace";
import { deleteInvite, getInvite, resolveInviteMatch } from "./invite";
import { createTeamMembership } from "./team";

type TCreatedUser = Pick<TUser, "id" | "email" | "name" | "locale" | "notificationSettings">;
type TSignUpOutcome = { status: "created"; user: TCreatedUser };
async function handleInviteAcceptance(inviteToken: string, user: TCreatedUser): Promise<void> {
  // An invite grants a specific address a specific role in a specific organization. Verifying the
  // signature and loading the row is not enough: without matching the token's email against the account
  // being created, anyone holding an invite link — they get forwarded, pasted into tickets, and land in
  // referrer logs — could redeem it with an arbitrary address and take the invited role, which may be
  // manager or owner. `resolveInviteMatch` also enforces the invite's expiry, which this path skipped.
  //
  // Deliberately re-checked here even though `createUserAction` already rejected an invalid token
  // before creating the user: this is the function that performs the grant, so the check belongs
  // beside it and keeps holding if another caller ever appears. The cost is one extra HMAC verify —
  // the invite lookup behind it is request-cached, so no second query.
  const inviteMatch = await resolveInviteMatch(inviteToken, user.email);
  if (inviteMatch !== "valid") {
    logger.warn({ inviteMatch }, "Rejected invite acceptance during sign-up");
    throw new InvalidInputError(INVITE_TOKEN_INVALID_ERROR_CODE);
  }

  const inviteTokenData = verifyInviteToken(inviteToken);
  const invite = await getInvite(inviteTokenData.inviteId);

  if (!invite) {
    throw new Error("Invalid invite ID");
  }

  await createMembership(invite.organizationId, user.id, {
    accepted: true,
    role: invite.role,
  });

  if (invite.teamIds) {
    await createTeamMembership(
      {
        organizationId: invite.organizationId,
        role: invite.role,
        teamIds: invite.teamIds,
      },
      user.id
    );
  }

  await updateUser(user.id, {
    notificationSettings: {
      alert: {},

      unsubscribedOrganizationIds: [invite.organizationId],
    },
  });

  await sendInviteAcceptedEmail(
    invite.creator.name ?? "",
    user.name,
    invite.creator.email,
    invite.creator.locale
  );
  await deleteInvite(invite.id);
}

async function handleOrganizationCreation(user: TCreatedUser): Promise<void> {
  const organization = await createOrganization({ name: `${user.name}'s Organization` });

  await createMembership(organization.id, user.id, {
    role: "owner",
    accepted: true,
  });

  await createWorkspace(organization.id, {
    name: DEFAULT_WORKSPACE_NAME,
  });

  await updateUser(user.id, {
    notificationSettings: {
      ...user.notificationSettings,
      alert: { ...user.notificationSettings?.alert },

      unsubscribedOrganizationIds: Array.from(
        new Set([...(user.notificationSettings?.unsubscribedOrganizationIds ?? []), organization.id])
      ),
    },
  });
}

/**
 * Provisioning that must only ever follow a real account creation. Takes the `"created"` outcome
 * rather than a bare user so an `"already_existed"` sign-up cannot reach it (ENG-2091).
 */
export async function handlePostUserCreation(
  { user }: Extract<TSignUpOutcome, { status: "created" }>,
  inviteToken: string | undefined
): Promise<void> {
  if (inviteToken) {
    await handleInviteAcceptance(inviteToken, user);
  } else {
    await handleOrganizationCreation(user);
  }
  // Better Auth sends the verification email itself during signUpEmail (sendOnSignUp) — no manual
  // send here. The legacy EMAIL_VERIFICATION_DISABLED branch (ENG-1527) is folded into auth.ts'
  // requireEmailVerification config and the callbackURL chosen in signUpUserSafely.
}

/**
 * The two sign-up gates that used to live only in `signup/page.tsx`, enforced here so a direct POST to
 * this action cannot walk around them. Extracted from `createUserAction` to keep that function within
 * the cognitive-complexity budget.
 *
 * Returns WHICH grant admitted the sign-up, because the two are not interchangeable downstream: only
 * the fresh-instance exception is single-use, and `user.create.before` needs to know that to stamp the
 * bootstrap marker (ENG-2247).
 */

/** Called only after a new managed identity was verified and inserted by the server. */
export async function completeManagedRegistration(
  userId: string,
  email: string,
  inviteToken?: string
): Promise<void> {
  const user = await getUserByEmail(email);
  if (!user || user.id !== userId) throw new Error("Account creation could not be confirmed.");
  await handlePostUserCreation({ status: "created", user }, inviteToken);
}
