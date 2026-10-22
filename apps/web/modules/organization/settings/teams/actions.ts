"use server";

import { z } from "zod";
import { prisma } from "@forms/database";
import { OrganizationRole } from "@forms/database/prisma";
import { logger } from "@forms/logger";
import { ZId, ZUuid } from "@forms/types/common";
import { AuthenticationError, OperationNotAllowedError, ValidationError } from "@forms/types/errors";
import { ZOrganizationRole } from "@forms/types/memberships";
import { assertCan, can } from "@/lib/authorization";
import { INVITE_DISABLED } from "@/lib/constants";
import { createInviteToken } from "@/lib/jwt";
import { getMembershipByUserIdOrganizationId } from "@/lib/membership/service";
import { getAccessFlags } from "@/lib/membership/utils";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getOrganizationIdFromInviteId } from "@/lib/utils/helper";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { sendInviteMemberEmail } from "@/modules/email";
import {
  deleteMembership,
  getMembershipsByUserId,
  getOrganizationOwnerCount,
} from "@/modules/organization/settings/teams/lib/membership";
import { ZInvitees } from "@/modules/organization/settings/teams/types/invites";
import { deleteInvite, getInvite, inviteUser, refreshInviteExpiration, resendInvite } from "./lib/invite";
import { type TBulkInviteResult, getInviteFailureReason } from "./lib/invite-failure";
import { reserveInviteRateLimit, settleInviteRateLimit } from "./lib/invite-rate-limit";

// Hard cap on a single bulk import to bound payload size and email fan-out.
const BULK_INVITE_MAX_INVITEES = 500;

// Cap on the teams one invite may name. See ZInviteUserAction.
const INVITE_MAX_TEAMS = 100;

const ZDeleteInviteAction = z.object({
  inviteId: ZUuid,
});

export const deleteInviteAction = authenticatedActionClient
  .inputSchema(ZDeleteInviteAction)
  .action(async ({ ctx, parsedInput }) => {
    const organizationId = await getOrganizationIdFromInviteId(parsedInput.inviteId);

    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage", {
      type: "organization",
      id: organizationId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, organizationId);
    return await deleteInvite(parsedInput.inviteId);
  });

const ZCreateInviteTokenAction = z.object({
  inviteId: ZUuid,
});

export const createInviteTokenAction = authenticatedActionClient
  .inputSchema(ZCreateInviteTokenAction)
  .action(async ({ parsedInput, ctx }) => {
    const organizationId = await getOrganizationIdFromInviteId(parsedInput.inviteId);

    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage", {
      type: "organization",
      id: organizationId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, organizationId);

    // Get old expiresAt for audit logging before update
    const oldInvite = await prisma.invite.findUnique({
      where: { id: parsedInput.inviteId },
      select: { email: true, expiresAt: true },
    });

    if (!oldInvite) {
      throw new ValidationError("Invite not found");
    }

    // Refresh the invitation expiration
    const updatedInvite = await refreshInviteExpiration(parsedInput.inviteId);

    // Set audit context

    const inviteToken = createInviteToken(parsedInput.inviteId, updatedInvite.email, {
      expiresIn: "7d",
    });

    return { inviteToken: encodeURIComponent(inviteToken) };
  });

const ZDeleteMembershipAction = z.object({
  userId: ZId,
  organizationId: ZId,
});

export const deleteMembershipAction = authenticatedActionClient
  .inputSchema(ZDeleteMembershipAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage", {
      type: "organization",
      id: parsedInput.organizationId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, parsedInput.organizationId);

    if (parsedInput.userId === ctx.user.id) {
      throw new OperationNotAllowedError("You cannot delete yourself from the organization");
    }

    const currentMembership = await getMembershipByUserIdOrganizationId(
      ctx.user.id,
      parsedInput.organizationId
    );

    if (!currentMembership) {
      throw new AuthenticationError("Not a member of this organization");
    }

    const membership = await getMembershipByUserIdOrganizationId(
      parsedInput.userId,
      parsedInput.organizationId
    );

    if (!membership) {
      throw new AuthenticationError("Not a member of this organization");
    }

    const isOwner = membership.role === "owner";

    if (currentMembership.role === "manager" && isOwner) {
      throw new OperationNotAllowedError("You cannot delete the owner of the organization");
    }

    if (isOwner) {
      const ownerCount = await getOrganizationOwnerCount(parsedInput.organizationId);

      if (ownerCount <= 1) {
        throw new ValidationError("You cannot delete the last owner of the organization");
      }
    }

    return await deleteMembership(parsedInput.userId, parsedInput.organizationId);
  });

const ZResendInviteAction = z.object({
  inviteId: ZUuid,
  organizationId: ZId,
});

export const resendInviteAction = authenticatedActionClient
  .inputSchema(ZResendInviteAction)
  .action(async ({ ctx, parsedInput }) => {
    if (INVITE_DISABLED) {
      throw new OperationNotAllowedError("Invite are disabled");
    }

    const inviteOrganizationId = await getOrganizationIdFromInviteId(parsedInput.inviteId);

    if (inviteOrganizationId !== parsedInput.organizationId) {
      throw new ValidationError("Invite does not belong to the organization");
    }

    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage", {
      type: "organization",
      id: parsedInput.organizationId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, parsedInput.organizationId);
    const rateLimitReservation = await reserveInviteRateLimit(parsedInput.organizationId, ctx.user.id);

    let invite: Awaited<ReturnType<typeof getInvite>>;
    let updatedInvite: Awaited<ReturnType<typeof resendInvite>>;
    try {
      invite = await getInvite(parsedInput.inviteId);
      updatedInvite = await resendInvite(parsedInput.inviteId);
    } catch (error) {
      await settleInviteRateLimit(rateLimitReservation, 0);
      throw error;
    }
    await settleInviteRateLimit(rateLimitReservation, 1);

    await sendInviteMemberEmail(
      parsedInput.inviteId,
      updatedInvite.email,
      invite?.creator?.name ?? "",
      updatedInvite.name ?? ""
    );

    return updatedInvite;
  });

/**
 * The capability half of "may this person send this invite", routed through the central interface.
 *
 * `team.manage` is the capability for a non-owner invite, asked once per requested team so the answer
 * covers exactly the teams the invite would write to. Distinct ids, checked one at a time, stopping at
 * the first refusal: asking per team makes the number of authorization decisions follow the request
 * body, so repeats are collapsed and the array is capped in the schema.
 */
const assertInviterMayInvite = async ({
  isOrgOwnerOrManager,
  organizationId,
  teamIds,
  userId,
}: Readonly<{
  isOrgOwnerOrManager: boolean;
  organizationId: string;
  teamIds: ReadonlyArray<string>;
  userId: string;
}>): Promise<void> => {
  if (isOrgOwnerOrManager) {
    await assertCan({ type: "user", id: userId }, "organization.manage", {
      type: "organization",
      id: organizationId,
    });
    return;
  }

  const actor = { type: "user", id: userId } as const;

  for (const teamId of new Set(teamIds)) {
    if (!(await can(actor, "team.manage", { type: "team", id: teamId }))) {
      throw new OperationNotAllowedError("Team admins can only add users to teams where they are admin");
    }
  }
};

const ZInviteUserAction = z.object({
  organizationId: ZId,
  email: z.string(),
  name: z.string().trim().min(1, "Name is required"),
  role: ZOrganizationRole,
  // Bounded because a team admin's authorization is now decided per named team: without a cap the
  // number of authorization decisions would follow the request body. The UI offers the teams the
  // inviter can see, so this is far above any real selection.
  teamIds: z.array(ZId).max(INVITE_MAX_TEAMS, `An invite is limited to ${INVITE_MAX_TEAMS} teams`),
});

export const inviteUserAction = authenticatedActionClient
  .inputSchema(ZInviteUserAction)
  .action(async ({ ctx, parsedInput }) => {
    if (INVITE_DISABLED) {
      throw new AuthenticationError("Invite disabled");
    }

    if (parsedInput.role === OrganizationRole.billing) {
      throw new ValidationError("Billing role is not allowed");
    }

    const currentUserMembership = await getMembershipByUserIdOrganizationId(
      ctx.user.id,
      parsedInput.organizationId
    );
    if (!currentUserMembership) {
      throw new AuthenticationError("User not a member of this organization");
    }

    const isOrgOwnerOrManager =
      currentUserMembership.role === "owner" || currentUserMembership.role === "manager";

    if (!isOrgOwnerOrManager) {
      throw new AuthenticationError("Not authorized to invite members");
    }

    await assertInviterMayInvite({
      isOrgOwnerOrManager,
      organizationId: parsedInput.organizationId,
      teamIds: parsedInput.teamIds,
      userId: ctx.user.id,
    });

    if (currentUserMembership.role === "manager" && parsedInput.role !== "member") {
      throw new OperationNotAllowedError("Managers can only invite users as members");
    }

    const rateLimitReservation = await reserveInviteRateLimit(parsedInput.organizationId, ctx.user.id);

    let inviteId: Awaited<ReturnType<typeof inviteUser>>;
    try {
      inviteId = await inviteUser({
        organizationId: parsedInput.organizationId,
        invitee: {
          email: parsedInput.email,
          name: parsedInput.name,
          role: parsedInput.role,
          teamIds: parsedInput.teamIds,
        },
        currentUserId: ctx.user.id,
      });
    } catch (error) {
      await settleInviteRateLimit(rateLimitReservation, 0);
      throw error;
    }
    await settleInviteRateLimit(rateLimitReservation, inviteId ? 1 : 0);

    if (inviteId) {
      // Email delivery is best-effort: the invite is already persisted and can be shared via its
      // link, so a failing/misconfigured SMTP must not fail the whole action — otherwise the created
      // invite is stranded behind an "Invite already exists" error on the user's next attempt.
      try {
        await sendInviteMemberEmail(inviteId, parsedInput.email, ctx.user.name ?? "", parsedInput.name ?? "");
      } catch (error) {
        logger.error(error, "Failed to send invite email");
      }
    }

    return inviteId;
  });

const ZBulkInviteUsersAction = z.object({
  organizationId: ZId,
  invitees: ZInvitees,
});

export const bulkInviteUsersAction = authenticatedActionClient
  .inputSchema(ZBulkInviteUsersAction)
  .action(async ({ ctx, parsedInput }) => {
    if (INVITE_DISABLED) {
      throw new AuthenticationError("Invite disabled");
    }

    const { organizationId, invitees } = parsedInput;

    if (invitees.length === 0) {
      throw new ValidationError("No invitees provided");
    }

    if (invitees.length > BULK_INVITE_MAX_INVITEES) {
      throw new ValidationError(`A bulk invite is limited to ${BULK_INVITE_MAX_INVITEES} members at a time`);
    }

    // Bulk invite is restricted to organization owners and managers.
    const currentUserMembership = await getMembershipByUserIdOrganizationId(ctx.user.id, organizationId);
    if (!currentUserMembership) {
      throw new AuthenticationError("User not a member of this organization");
    }

    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage", {
      type: "organization",
      id: organizationId,
    });

    // Validate roles for the whole batch up front.
    if (invitees.some((invitee) => invitee.role === OrganizationRole.billing)) {
      throw new ValidationError("Billing role is not allowed");
    }

    if (currentUserMembership.role === "manager" && invitees.some((invitee) => invitee.role !== "member")) {
      throw new OperationNotAllowedError("Managers can only invite users as members");
    }

    const rateLimitReservation = await reserveInviteRateLimit(organizationId, ctx.user.id, invitees.length);

    const results: TBulkInviteResult[] = [];
    const invitedEmails: string[] = [];

    try {
      for (const invitee of invitees) {
        const email = invitee.email.toLowerCase();
        try {
          const inviteId = await inviteUser({
            organizationId,
            invitee: { ...invitee, email },
            currentUserId: ctx.user.id,
          });

          if (inviteId) {
            // Best-effort email (see inviteUserAction): a failed send must not flip a created invite
            // to "failed" — the invitee exists and can be reached via the invite link.
            try {
              await sendInviteMemberEmail(inviteId, email, ctx.user.name ?? "", invitee.name ?? "");
            } catch (error) {
              logger.error(error, "Failed to send bulk invite email");
            }
            invitedEmails.push(email);
            results.push({ email, success: true });
          } else {
            results.push({ email, success: false, failureReason: "unknown" });
          }
        } catch (error) {
          results.push({ email, success: false, failureReason: getInviteFailureReason(error) });
        }
      }
    } finally {
      await settleInviteRateLimit(rateLimitReservation, invitedEmails.length);
    }

    return results;
  });

const ZLeaveOrganizationAction = z.object({
  organizationId: ZId,
});

export const leaveOrganizationAction = authenticatedActionClient
  .inputSchema(ZLeaveOrganizationAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.read", {
      type: "organization",
      id: parsedInput.organizationId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, parsedInput.organizationId);

    const membership = await getMembershipByUserIdOrganizationId(ctx.user.id, parsedInput.organizationId);

    if (!membership) {
      throw new AuthenticationError("Not a member of this organization");
    }

    const { isOwner } = getAccessFlags(membership.role);

    if (isOwner) {
      throw new OperationNotAllowedError("You cannot leave an organization you own");
    }

    const memberships = await getMembershipsByUserId(ctx.user.id);
    if (!memberships || memberships?.length <= 1) {
      throw new ValidationError("You cannot leave the only organization you are a member of");
    }

    return await deleteMembership(ctx.user.id, parsedInput.organizationId);
  });
