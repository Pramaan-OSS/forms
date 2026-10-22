import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { TActionClass } from "@forms/types/action-classes";
import { ZId } from "@forms/types/common";
import { DatabaseError } from "@forms/types/errors";
import { validateInputs } from "@/lib/utils/validate";

const selectActionClass = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  description: true,
  type: true,
  key: true,
  noCodeConfig: true,
  workspaceId: true,
} satisfies Prisma.ActionClassSelect;

export const getActionClasses = reactCache(async (workspaceIds: string[]): Promise<TActionClass[]> => {
  validateInputs([workspaceIds, ZId.array()]);

  try {
    return await prisma.actionClass.findMany({
      where: {
        workspaceId: { in: workspaceIds },
      },
      select: selectActionClass,
      orderBy: {
        createdAt: "asc",
      },
    });
  } catch {
    throw new DatabaseError(`Database error when fetching actions for workspace ${workspaceIds}`);
  }
});
