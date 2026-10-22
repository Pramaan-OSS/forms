import { prisma } from "@forms/database";
import { type TIngestFlag } from "@forms/types/embedded-data-ingest";
import { TResponse, TResponseUpdateInput } from "@forms/types/responses";
import { updateResponse } from "@/lib/response/service";

export const updateResponseForClient = async (
  responseId: string,
  responseInput: TResponseUpdateInput,
  ingestFlags?: readonly TIngestFlag[]
): Promise<TResponse> => {
  return prisma.$transaction(async (tx) => updateResponse(responseId, responseInput, tx, ingestFlags));
};
