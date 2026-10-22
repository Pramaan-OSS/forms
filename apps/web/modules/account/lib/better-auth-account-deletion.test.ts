import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { logger } from "@forms/logger";
import { deleteUserOrganizationRelationships } from "@/lib/authzed/organization-membership";
import { deleteUserTeamRelationships } from "@/lib/authzed/team-workspace";
import { deleteOrganization, getOrganizationsWhereUserIsSingleOwner } from "@/lib/organization/service";
import {
  accountDeletionAfterDelete,
  accountDeletionBeforeDelete,
  accountDeletionConfig,
  requireDeletionConfirmationBeforeHandler,
} from "./better-auth-account-deletion";

vi.mock("@forms/database", () => ({
  prisma: { invite: { deleteMany: vi.fn() }, user: { findUnique: vi.fn() } },
}));
vi.mock("@forms/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/authzed/organization-membership", () => ({
  deleteUserOrganizationRelationships: vi.fn(),
}));
vi.mock("@/lib/authzed/team-workspace", () => ({
  deleteUserTeamRelationships: vi.fn(),
}));
vi.mock("@/lib/organization/service", () => ({
  deleteOrganization: vi.fn(),
  getOrganizationsWhereUserIsSingleOwner: vi.fn(),
}));

const user = { id: "user-1", email: "ada@example.com", name: "Ada" } as Parameters<
  typeof accountDeletionBeforeDelete
>[0];

describe("accountDeletionBeforeDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.invite.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ identityProviderAccountId: null } as never);
    vi.mocked(deleteOrganization).mockResolvedValue(true as never);
  });

  test("blocks deletion when the user is the sole owner of any organization", async () => {
    vi.mocked(getOrganizationsWhereUserIsSingleOwner).mockResolvedValue([{ id: "org-1" }] as never);

    await expect(accountDeletionBeforeDelete(user)).rejects.toBeInstanceOf(APIError);
    // throws before any destructive cleanup
    expect(deleteOrganization).not.toHaveBeenCalled();
    expect(prisma.invite.deleteMany).not.toHaveBeenCalled();
  });

  test("no sole-owner orgs: deletes only the creator's invites", async () => {
    vi.mocked(getOrganizationsWhereUserIsSingleOwner).mockResolvedValue([] as never);

    await expect(accountDeletionBeforeDelete(user)).resolves.toBeUndefined();

    expect(deleteOrganization).not.toHaveBeenCalled();
    expect(prisma.invite.deleteMany).toHaveBeenCalledWith({ where: { creatorId: "user-1" } });
  });
});

describe("accountDeletionAfterDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("runs both AuthZed cleanups for the deleted user", async () => {
    await accountDeletionAfterDelete(user);

    expect(deleteUserOrganizationRelationships).toHaveBeenCalledWith("user-1");
    expect(deleteUserTeamRelationships).toHaveBeenCalledWith("user-1");
  });

  test("continues post-delete cleanup when the AuthZed cleanup unexpectedly rejects", async () => {
    vi.mocked(deleteUserOrganizationRelationships).mockRejectedValue(new Error("sensitive raw error"));

    await expect(accountDeletionAfterDelete(user)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      {
        component: "authzed",
        errorCode: "authzed_internal",
        errorName: "Error",
        operation: "account_delete_organization_cleanup",
        retryable: false,
        status: "failed",
      },
      "Unexpected AuthZed projection failure after source commit"
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("sensitive raw error");
  });
});

describe("accountDeletionConfig", () => {
  test("is enabled, wires both hooks, and sets no global delete-verification email", () => {
    expect(accountDeletionConfig.enabled).toBe(true);
    expect(accountDeletionConfig.beforeDelete).toBe(accountDeletionBeforeDelete);
    expect(accountDeletionConfig.afterDelete).toBe(accountDeletionAfterDelete);
    expect("sendDeleteAccountVerification" in accountDeletionConfig).toBe(false);
  });
});

const makeDeleteCtx = (overrides: {
  path?: string;
  body?: unknown;
}): Parameters<typeof requireDeletionConfirmationBeforeHandler>[0] =>
  ({ path: overrides.path ?? "/delete-user", body: overrides.body }) as unknown as Parameters<
    typeof requireDeletionConfirmationBeforeHandler
  >[0];

describe("requireDeletionConfirmationBeforeHandler (delete-user freshAge guard)", () => {
  test("allows the request when a password is supplied", async () => {
    await expect(
      requireDeletionConfirmationBeforeHandler(makeDeleteCtx({ body: { password: "pw" } }))
    ).resolves.toBeUndefined();
  });

  test("allows the request when a deletion token is supplied", async () => {
    await expect(
      requireDeletionConfirmationBeforeHandler(makeDeleteCtx({ body: { token: "tok" } }))
    ).resolves.toBeUndefined();
  });

  test("blocks a confirmation-less delete (closes the freshAge password bypass)", async () => {
    await expect(requireDeletionConfirmationBeforeHandler(makeDeleteCtx({ body: {} }))).rejects.toThrow(
      "Password confirmation is required"
    );
  });

  test("blocks when the request has no body", async () => {
    await expect(
      requireDeletionConfirmationBeforeHandler(makeDeleteCtx({ body: undefined }))
    ).rejects.toThrow("Password confirmation is required");
  });

  test("exempts the SSO email-link callback (/delete-user/callback)", async () => {
    // SSO deletion completes via the emailed GET callback (carrying its own token), not a password —
    // the guard must let it through, or the SSO email-link flow breaks.
    await expect(
      requireDeletionConfirmationBeforeHandler(makeDeleteCtx({ path: "/delete-user/callback", body: {} }))
    ).resolves.toBeUndefined();
  });

  test("ignores non-delete-user paths", async () => {
    await expect(
      requireDeletionConfirmationBeforeHandler(makeDeleteCtx({ path: "/sign-out", body: {} }))
    ).resolves.toBeUndefined();
  });
});
