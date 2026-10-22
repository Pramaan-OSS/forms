import { beforeEach, describe, expect, test, vi } from "vitest";
import { hasOrganizationEntitlement } from "@/modules/entitlements/lib/checks";
import { getSurveyFollowUpsPermission } from "./utils";

vi.mock("@/modules/entitlements/lib/checks", () => ({
  hasOrganizationEntitlement: vi.fn(),
}));

describe("getSurveyFollowUpsPermission", () => {
  beforeEach(() => {
    vi.mocked(hasOrganizationEntitlement).mockResolvedValue(false);
  });

  test("returns the entitlement answer for the workspace", async () => {
    vi.mocked(hasOrganizationEntitlement).mockResolvedValueOnce(true);

    const result = await getSurveyFollowUpsPermission("org_123");

    expect(result).toBe(true);
    expect(hasOrganizationEntitlement).toHaveBeenCalledWith("org_123", "follow-ups");
  });

  test("returns false when the entitlement is missing", async () => {
    vi.mocked(hasOrganizationEntitlement).mockResolvedValueOnce(false);

    const result = await getSurveyFollowUpsPermission("org_123");

    expect(result).toBe(false);
  });
});
