import "server-only";
import { prisma } from "@forms/database";
import { TResponse, TResponseInput } from "@forms/types/responses";
import { updateResponse } from "@/lib/response/service";

export const updateResponseWithQuotaEvaluation = async (
  responseId: string,
  responseInput: Partial<TResponseInput>
): Promise<TResponse> => {
  return prisma.$transaction(async (tx) => updateResponse(responseId, responseInput, tx));
};
