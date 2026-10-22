import { describe, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { logger } from "@forms/logger";
import { DEFAULT_ORGANIZATION_BILLING, TOrganizationBilling } from "@forms/types/organizations";
import { getOrganizationBillingByWorkspaceId } from "./organization";

vi.mock("@forms/database", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@forms/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("getOrganizationBillingByWorkspaceId", () => {
  const workspaceId = "ws-123";
  const mockBillingData: TOrganizationBilling = {
    limits: {
      monthly: { responses: 0 },
      workspaces: 3,
    },
    usageCycleAnchor: new Date(),
    stripeCustomerId: "mock-stripe-customer-id",
  };

  test("returns billing when organization is found", async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ billing: mockBillingData } as any);
    const result = await getOrganizationBillingByWorkspaceId(workspaceId);
    expect(result).toEqual(DEFAULT_ORGANIZATION_BILLING);
    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: workspaceId },
      select: { id: true },
    });
  });

  test("returns null when organization is not found", async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValueOnce(null);
    const result = await getOrganizationBillingByWorkspaceId(workspaceId);
    expect(result).toBeNull();
  });

  test("logs error and returns null on exception", async () => {
    const error = new Error("db error");
    vi.mocked(prisma.workspace.findUnique).mockRejectedValueOnce(error);
    const result = await getOrganizationBillingByWorkspaceId(workspaceId);
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(error, "Failed to get organization billing by workspace ID");
  });
});
