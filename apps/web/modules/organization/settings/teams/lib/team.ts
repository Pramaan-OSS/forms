import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { ZId } from "@forms/types/common";
import { DatabaseError } from "@forms/types/errors";
import { validateInputs } from "@/lib/utils/validate";
import { TOrganizationTeam } from "../types/team";

export const getTeamsByOrganizationId = reactCache(
  async (organizationId: string): Promise<TOrganizationTeam[]> => {
    validateInputs([organizationId, ZId]);

    try {
      const teams = await prisma.team.findMany({
        where: {
          organizationId,
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      return teams;
    } catch {
      throw new DatabaseError("Error getting teams by organization id");
    }
  }
);
