import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { err, ok } from "@forms/types/error-handlers";
import { DEFAULT_ORGANIZATION_BILLING } from "@forms/types/organizations";

export const getOrganizationIdFromWorkspaceId = reactCache(async (workspaceId: string) => {
  try {
    const organization = await prisma.organization.findFirst({
      where: {
        workspaces: {
          some: {
            id: workspaceId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!organization) {
      return err({ type: "not_found", details: [{ field: "organization", issue: "not found" }] });
    }

    return ok(organization.id);
  } catch (error) {
    return err({
      type: "internal_server_error",
      details: [
        { field: "organization", issue: error instanceof Error ? error.message : "Unknown error occurred" },
      ],
    });
  }
});

export const getOrganizationBilling = reactCache(async (organizationId: string) => {
  try {
    const organization = await prisma.organization.findFirst({
      where: {
        id: organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!organization) {
      return err({ type: "not_found", details: [{ field: "organization", issue: "not found" }] });
    }

    return ok(DEFAULT_ORGANIZATION_BILLING);
  } catch (error) {
    return err({
      type: "internal_server_error",
      details: [
        { field: "organization", issue: error instanceof Error ? error.message : "Unknown error occurred" },
      ],
    });
  }
});
