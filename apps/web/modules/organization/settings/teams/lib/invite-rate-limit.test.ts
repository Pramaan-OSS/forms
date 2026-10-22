import { beforeEach, describe, expect, test, vi } from "vitest";
import { reserveRateLimitUsage, settleRateLimitUsage } from "@/modules/core/rate-limit/helpers";
import type { TRateLimitReservation } from "@/modules/core/rate-limit/rate-limit";
import { getInviteRateLimitConfig, reserveInviteRateLimit, settleInviteRateLimit } from "./invite-rate-limit";

vi.mock("@/lib/constants", () => ({
  INVITE_RATE_LIMIT_PER_24_HOURS: 75,
}));

vi.mock("@/modules/core/rate-limit/helpers", () => ({
  reserveRateLimitUsage: vi.fn(),
  settleRateLimitUsage: vi.fn(),
}));

const reservation = (identifier: string, namespace: string, requested: number): TRateLimitReservation => ({
  identifier,
  key: `rate-limit-key:${identifier}`,
  namespace,
  requested,
  settled: false,
});

describe("getInviteRateLimitConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("uses the configured instance limit, the same for every organization", async () => {
    const config = await getInviteRateLimitConfig();

    expect(config).toEqual({
      interval: 3600 * 24,
      allowedPerInterval: 75,
      namespace: "action:invite-member",
    });
  });

  test("reserves the recipient count against the organization and the inviting user", async () => {
    const organization = reservation("org_1", "action:invite-member", 25);
    const user = reservation("user_1", "action:invite-member:user", 25);
    vi.mocked(reserveRateLimitUsage).mockResolvedValueOnce(organization).mockResolvedValueOnce(user);

    const result = await reserveInviteRateLimit("org_1", "user_1", 25);

    expect(reserveRateLimitUsage).toHaveBeenNthCalledWith(
      1,
      { interval: 3600 * 24, allowedPerInterval: 75, namespace: "action:invite-member" },
      "org_1",
      25
    );
    expect(reserveRateLimitUsage).toHaveBeenNthCalledWith(
      2,
      { interval: 3600 * 24, allowedPerInterval: 75, namespace: "action:invite-member:user" },
      "user_1",
      25
    );
    expect(result).toEqual({ organization, user });
  });

  test("gives the user budget the same allowance as the organization's resolved limit", async () => {
    vi.mocked(reserveRateLimitUsage).mockResolvedValue(undefined);

    await reserveInviteRateLimit("org_1", "user_1");

    expect(vi.mocked(reserveRateLimitUsage).mock.calls[1][0].allowedPerInterval).toBe(75);
  });

  test("releases the organization reservation and rethrows when the user is over budget", async () => {
    const organization = reservation("org_1", "action:invite-member", 1);
    const overBudget = new Error("Maximum number of requests reached");
    vi.mocked(reserveRateLimitUsage).mockResolvedValueOnce(organization).mockRejectedValueOnce(overBudget);

    await expect(reserveInviteRateLimit("org_1", "user_1")).rejects.toBe(overBudget);

    expect(settleRateLimitUsage).toHaveBeenCalledWith(organization, 0);
  });

  test("does not reserve the user budget when the organization is over budget", async () => {
    const overBudget = new Error("Maximum number of requests reached");
    vi.mocked(reserveRateLimitUsage).mockRejectedValueOnce(overBudget);

    await expect(reserveInviteRateLimit("org_1", "user_1")).rejects.toBe(overBudget);

    expect(reserveRateLimitUsage).toHaveBeenCalledTimes(1);
  });

  test("settles both reservations to the successful recipient count", async () => {
    const organization = reservation("org_1", "action:invite-member", 25);
    const user = reservation("user_1", "action:invite-member:user", 25);

    await settleInviteRateLimit({ organization, user }, 10);

    expect(settleRateLimitUsage).toHaveBeenCalledWith(organization, 10);
    expect(settleRateLimitUsage).toHaveBeenCalledWith(user, 10);
  });
});
