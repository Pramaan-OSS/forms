import { describe, expect, test } from "vitest";
import { OrganizationRole } from "@forms/database/prisma";
import { getRoles } from "./utils";

describe("getRoles", () => {
  test("should return all roles except billing when not in Forms Cloud", () => {
    const result = getRoles();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.data).toEqual(Object.values(OrganizationRole).filter((role) => role !== "billing"));
    }
  });
});
