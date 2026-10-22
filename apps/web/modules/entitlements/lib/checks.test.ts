import { beforeEach, describe, expect, test, vi } from "vitest";
import { hasOrganizationEntitlement, hasOrganizationEntitlementWithLicenseGuard } from "./checks";
import { getOrganizationEntitlementsContext } from "./provider";

vi.mock("server-only", () => ({}));

vi.mock("./provider", () => ({
  getOrganizationEntitlementsContext: vi.fn(),
}));

const mockGetContext = vi.mocked(getOrganizationEntitlementsContext);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContext.mockResolvedValue({
    organizationId: "org1",
    source: "included",
    features: [
      "follow-ups",
      "custom-links-in-surveys",
      "custom-redirect-url",
      "bulk-invite",
      "custom-css",
      "hide-branding",
    ],
    limits: { workspaces: null, monthlyResponses: null, monthlyWorkflowRuns: null },
  });
});

describe("hasOrganizationEntitlement", () => {
  test("returns true for included features", async () => {
    expect(await hasOrganizationEntitlement("org1", "follow-ups")).toBe(true);
    expect(await hasOrganizationEntitlement("org1", "custom-redirect-url")).toBe(true);
    expect(await hasOrganizationEntitlement("org1", "bulk-invite")).toBe(true);
    expect(await hasOrganizationEntitlement("org1", "custom-css")).toBe(true);
  });

  test("returns false for features of removed paid surfaces", async () => {
    for (const key of [
      "rbac",
      "contacts",
      "workflows",
      "dashboards",
      "spam-protection",
      "quota-management",
    ]) {
      expect(await hasOrganizationEntitlement("org1", key)).toBe(false);
    }
  });

  test("returns false for unknown feature key", async () => {
    expect(await hasOrganizationEntitlement("org1", "not-a-feature")).toBe(false);
  });

  test("accepts usage-limit keys but they are not included", async () => {
    expect(await hasOrganizationEntitlement("org1", "responses-5000")).toBe(false);
  });
});

describe("hasOrganizationEntitlementWithLicenseGuard", () => {
  test("matches the plain entitlement answer (no licence layer exists)", async () => {
    expect(await hasOrganizationEntitlementWithLicenseGuard("org1", "follow-ups")).toBe(true);
    expect(await hasOrganizationEntitlementWithLicenseGuard("org1", "rbac")).toBe(false);
  });
});
