import { z } from "zod";
import { prisma } from "@forms/database";
import { Prisma, Webhook } from "@forms/database/prisma";
import { ZId } from "@forms/types/common";
import { DatabaseError } from "@forms/types/errors";
import { validateInputs } from "@/lib/utils/validate";

export const getWebhookCountBySource = async (
  workspaceId: string,
  source?: Webhook["source"]
): Promise<number> => {
  validateInputs([workspaceId, ZId], [source, z.string().optional()]);

  try {
    const count = await prisma.webhook.count({
      where: {
        workspaceId,
        source,
      },
    });
    return count;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(error.message);
    }

    throw error;
  }
};
