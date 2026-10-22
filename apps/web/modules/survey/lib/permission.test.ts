import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OperationNotAllowedError } from "@forms/types/errors";
import { hasOrganizationEntitlement } from "@/modules/entitlements/lib/checks";
import { checkSpamProtectionPermission, getExternalUrlsPermission } from "./permission";

vi.mock("@/modules/entitlements/lib/checks", () => ({
  hasOrganizationEntitlement: vi.fn(),
}));

const mockedHasEntitlement = vi.mocked(hasOrganizationEntitlement);

describe("checkSpamProtectionPermission", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("resolves when spam protection is enabled", async () => {
    mockedHasEntitlement.mockResolvedValue(true);

    await expect(checkSpamProtectionPermission("org_1")).resolves.toBeUndefined();
  });

  test("throws when spam protection is not enabled", async () => {
    mockedHasEntitlement.mockResolvedValue(false);

    await expect(checkSpamProtectionPermission("org_1")).rejects.toThrow(OperationNotAllowedError);
    await expect(checkSpamProtectionPermission("org_1")).rejects.toThrow(
      "Spam protection is not enabled for this organization"
    );
  });
});

describe("getExternalUrlsPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns true when both entitlement checks pass", async () => {
    mockedHasEntitlement.mockResolvedValue(true);

    const result = await getExternalUrlsPermission("org_123");

    expect(result).toBe(true);
    expect(hasOrganizationEntitlement).toHaveBeenCalledTimes(2);
  });

  test("returns false when one entitlement check fails", async () => {
    mockedHasEntitlement.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await getExternalUrlsPermission("org_123");

    expect(result).toBe(false);
  });
});
