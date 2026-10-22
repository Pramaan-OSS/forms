import { OrganizationRole } from "@forms/database/prisma";
import { Result, err, ok } from "@forms/types/error-handlers";
import { ApiErrorResponseV2 } from "@/modules/api/v2/types/api-error";

export const getRoles = (): Result<{ data: string[] }, ApiErrorResponseV2> => {
  try {
    const roles = Object.values(OrganizationRole);

    // The billing role belonged to the removed paid tiers; never offer it.
    const filteredRoles = roles.filter((role) => role !== "billing");
    return ok({
      data: filteredRoles,
    });
  } catch {
    return err({
      type: "internal_server_error",
      details: [{ field: "roles", issue: "Failed to get roles" }],
    });
  }
};
