import { describe, expect, test } from "vitest";
import { getBillingFallbackPath } from "./navigation";

describe("getBillingFallbackPath", () => {
  test("lands on the organization general settings page", () => {
    const path = getBillingFallbackPath("org_123");
    expect(path).toBe("/organizations/org_123/settings/general");
  });
});
