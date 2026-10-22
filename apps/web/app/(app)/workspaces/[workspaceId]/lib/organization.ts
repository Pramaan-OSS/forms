import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { ZString } from "@forms/types/common";
import { DatabaseError, ResourceNotFoundError } from "@forms/types/errors";
import { lookupAuthorizedOrganizationIds } from "@/lib/authorization/resource-list";
import { validateInputs } from "@/lib/utils/validate";

export const getOrganizationsByUserId = reactCache(
  async (userId: string): Promise<{ id: string; name: string }[]> => {
    validateInputs([userId, ZString]);

    try {
      const organizationIds = await lookupAuthorizedOrganizationIds({ type: "user", id: userId });
      if (organizationIds.length === 0) return [];

      const organizations = await prisma.organization.findMany({
        where: {
          id: { in: [...organizationIds] },
        },
        // Deterministic order so callers that take organizations[0] (e.g. account settings'
        // default org) always resolve the same organization for a given user. id breaks ties when
        // two organizations share a createdAt timestamp.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
        },
      });
      if (!organizations) {
        throw new ResourceNotFoundError("Organizations by UserId", userId);
      }
      return organizations;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError(error.message);
      }

      throw error;
    }
  }
);
