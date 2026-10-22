import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { DatabaseError, ResourceNotFoundError } from "@forms/types/errors";
import { DEFAULT_ORGANIZATION_BILLING, type TOrganizationBilling } from "@forms/types/organizations";

export const getOrganizationIdFromWorkspaceId = reactCache(async (workspaceId: string): Promise<string> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { organizationId: true },
  });

  if (!workspace) {
    throw new ResourceNotFoundError("Workspace", workspaceId);
  }

  return workspace.organizationId;
});

export const getOrganizationAIKeys = reactCache(
  async (
    organizationId: string
  ): Promise<{
    isAISmartToolsEnabled: boolean;
    billing: TOrganizationBilling;
  } | null> => {
    try {
      const organization = await prisma.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          isAISmartToolsEnabled: true,
        },
      });

      if (!organization) {
        return null;
      }

      return {
        isAISmartToolsEnabled: organization.isAISmartToolsEnabled,
        billing: DEFAULT_ORGANIZATION_BILLING,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError(error.message);
      }

      throw error;
    }
  }
);
