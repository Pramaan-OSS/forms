import "server-only";
import { INVITE_RATE_LIMIT_PER_24_HOURS } from "@/lib/constants";
import { reserveRateLimitUsage, settleRateLimitUsage } from "@/modules/core/rate-limit/helpers";
import type { TRateLimitReservation } from "@/modules/core/rate-limit/rate-limit";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import type { TRateLimitConfig } from "@/modules/core/rate-limit/types/rate-limit";

export type TInviteRateLimitReservation = {
  organization: TRateLimitReservation | undefined;
  user: TRateLimitReservation | undefined;
};

export const getInviteRateLimitConfig = async (): Promise<TRateLimitConfig> => {
  return {
    ...rateLimitConfigs.actions.inviteMember,
    allowedPerInterval: INVITE_RATE_LIMIT_PER_24_HOURS,
  };
};

/**
 * Reserves the recipients against the organization's budget and against the inviting user's budget.
 * The user budget has the same allowance as the organization's and follows the user across every
 * organization they own, so creating a fresh organization does not hand them a fresh budget.
 */
export const reserveInviteRateLimit = async (
  organizationId: string,
  userId: string,
  recipients = 1
): Promise<TInviteRateLimitReservation> => {
  const organizationConfig = await getInviteRateLimitConfig();
  const organization = await reserveRateLimitUsage(organizationConfig, organizationId, recipients);

  try {
    const user = await reserveRateLimitUsage(
      {
        ...rateLimitConfigs.actions.inviteMemberPerUser,
        allowedPerInterval: organizationConfig.allowedPerInterval,
      },
      userId,
      recipients
    );
    return { organization, user };
  } catch (error) {
    // The user is over budget: hand the organization's reservation back so a refused request costs nothing.
    await settleRateLimitUsage(organization, 0);
    throw error;
  }
};

export const settleInviteRateLimit = async (
  reservation: TInviteRateLimitReservation,
  successfulRecipients: number
): Promise<void> => {
  await Promise.all([
    settleRateLimitUsage(reservation.organization, successfulRecipients),
    settleRateLimitUsage(reservation.user, successfulRecipients),
  ]);
};
