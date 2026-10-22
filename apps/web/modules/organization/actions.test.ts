import { beforeEach, describe, expect, test, vi } from "vitest";
import { TooManyRequestsError } from "@forms/types/errors";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { createOrganizationAction } from "./actions";

const mocks = vi.hoisted(() => ({
  applyRateLimit: vi.fn(),
  createMembership: vi.fn(),
  createOrganization: vi.fn(),
  createWorkspace: vi.fn(),
  getIsMultiOrgEnabled: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({ IS_FORMS_CLOUD: false }));
vi.mock("@/lib/membership/service", () => ({ createMembership: mocks.createMembership }));
vi.mock("@/lib/organization/service", () => ({ createOrganization: mocks.createOrganization }));
vi.mock("@/lib/user/service", () => ({ updateUser: mocks.updateUser }));
vi.mock("@/lib/utils/action-client", () => ({
  authenticatedActionClient: {
    inputSchema: vi.fn(() => ({ action: vi.fn((fn) => fn) })),
  },
}));
vi.mock("@/lib/workspace/constants", () => ({ DEFAULT_WORKSPACE_NAME: "My Workspace" }));
vi.mock("@/modules/core/rate-limit/helpers", () => ({ applyRateLimit: mocks.applyRateLimit }));
vi.mock("@/modules/workspaces/settings/lib/workspace", () => ({ createWorkspace: mocks.createWorkspace }));

describe("createOrganizationAction rate limit", () => {
  const ctx = { user: { id: "user-1", notificationSettings: {} }, auditLoggingCtx: {} };
  const parsedInput = { organizationName: "Acme" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIsMultiOrgEnabled.mockResolvedValue(true);
    mocks.createOrganization.mockResolvedValue({ id: "org-1", name: "Acme" });
    mocks.createWorkspace.mockResolvedValue({ id: "workspace-1", name: "My Workspace" });
  });

  test("counts the creation against the requesting user's daily budget", async () => {
    await createOrganizationAction({ ctx, parsedInput } as never);

    expect(mocks.applyRateLimit).toHaveBeenCalledWith(rateLimitConfigs.actions.createOrganization, "user-1");
    expect(mocks.createOrganization).toHaveBeenCalledTimes(1);
  });

  test("creates nothing once the user is over budget", async () => {
    mocks.applyRateLimit.mockRejectedValueOnce(
      new TooManyRequestsError("Maximum number of requests reached")
    );

    await expect(createOrganizationAction({ ctx, parsedInput } as never)).rejects.toBeInstanceOf(
      TooManyRequestsError
    );

    expect(mocks.createOrganization).not.toHaveBeenCalled();
    expect(mocks.createMembership).not.toHaveBeenCalled();
    expect(mocks.createWorkspace).not.toHaveBeenCalled();
  });
});
