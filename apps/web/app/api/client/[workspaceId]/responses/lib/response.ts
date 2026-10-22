import "server-only";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import type { TContactAttributes } from "@forms/types/contact-attribute";
import type { TIngestFlag } from "@forms/types/embedded-data-ingest";
import type { TResponse } from "@forms/types/responses";
import type { TTag } from "@forms/types/tags";

export const buildClientResponse = (
  responsePrisma: Omit<TResponse, "contact" | "tags"> & { tags: { tag: TTag }[] },
  contact: { id: string; attributes: TContactAttributes } | null
): TResponse => ({
  ...responsePrisma,
  contact: contact
    ? {
        id: contact.id,
        userId: contact.attributes.userId,
      }
    : null,
  tags: responsePrisma.tags.map((tagPrisma: { tag: TTag }) => tagPrisma.tag),
});

/**
 * What a create reads before its transaction opens: the workspace's organization (checked to exist)
 * and the contact the response links to. These go through the root client, so reading them inside the
 * transaction would check out a second pool connection while the transaction holds the first, and on a
 * saturated pool that read queues behind the very transaction waiting for it (ENG-3285).
 */
export type TClientResponseCreateContext = {
  contact: { id: string; attributes: TContactAttributes } | null;
};

/** The two halves of a versioned client create: root-client reads, then the transactional write. */
export type TClientResponseWriter<TInput> = {
  resolveContext: (responseInput: TInput) => Promise<TClientResponseCreateContext>;
  createResponse: (
    responseInput: TInput,
    context: TClientResponseCreateContext,
    tx: Prisma.TransactionClient,
    ingestFlags?: readonly TIngestFlag[]
  ) => Promise<TResponse>;
};

/**
 * A caller-owned transaction plus everything that had to be read before it opened. Nothing here is
 * re-checked against the response input: `responseContext` must come from the version's
 * `resolveCreateResponseContext` for the same workspace and respondent, or its contact is linked to a
 * response it does not belong to.
 */
export type TCreateResponseTxContext = {
  tx: Prisma.TransactionClient;
  responseContext: TClientResponseCreateContext;
};

/**
 * `ingestFlags` rides alongside the parsed input rather than inside it: the server computes them from
 * the incoming data (ENG-1845) and a client-sent list could claim "no flags", which is the same trust
 * problem as the client's filtering. See `buildPrismaResponseData`.
 */
export const createResponseWithQuotaEvaluation = async <TInput extends { surveyId: string }>(
  responseInput: TInput,
  { resolveContext, createResponse }: TClientResponseWriter<TInput>,
  ingestFlags?: readonly TIngestFlag[],
  // Callers that persist a response as part of a larger all-or-nothing write pass their own
  // transaction so the response and their surrounding rows share one commit. Prisma has no nested
  // interactive transactions, so opening a second one here would commit independently — the caller's
  // rollback would then leave the response behind. Omitted by the request paths, which own a single
  // response each and get their own transaction below. The response context comes with it because it
  // must be read before that transaction opened.
  txContext?: TCreateResponseTxContext
) => {
  const create = async (
    txClient: Prisma.TransactionClient,
    responseContext: TClientResponseCreateContext
  ) => {
    return await createResponse(responseInput, responseContext, txClient, ingestFlags);
  };

  if (txContext) {
    return await create(txContext.tx, txContext.responseContext);
  }

  return await prisma.$transaction(async (txClient) => {
    const responseContext = await resolveContext(responseInput);
    return await create(txClient, responseContext);
  });
};
