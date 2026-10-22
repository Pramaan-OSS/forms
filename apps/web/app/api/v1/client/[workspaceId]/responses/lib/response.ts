import "server-only";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { TContactAttributes } from "@forms/types/contact-attribute";
import { type TIngestFlag } from "@forms/types/embedded-data-ingest";
import { ResourceNotFoundError } from "@forms/types/errors";
import { TResponse, TResponseInput, ZResponseInput } from "@forms/types/responses";
import {
  type TClientResponseCreateContext,
  type TCreateResponseTxContext,
  buildClientResponse,
  createResponseWithQuotaEvaluation as createClientResponseWithQuotaEvaluation,
} from "@/app/api/client/[workspaceId]/responses/lib/response";
import { handleClientResponseCreateError } from "@/app/api/client/[workspaceId]/responses/lib/response-error";
import { buildPrismaResponseData } from "@/app/api/v1/lib/utils";
import { assertDisplayOwnership } from "@/lib/display/service";
import { getOrganization } from "@/lib/organization/service";
import { calculateTtcTotal } from "@/lib/response/utils";
import { getOrganizationIdFromWorkspaceId } from "@/lib/utils/helper";
import { validateInputs } from "@/lib/utils/validate";
import { getContactByUserId } from "./contact";

export const responseSelection = {
  id: true,
  createdAt: true,
  updatedAt: true,
  surveyId: true,
  finished: true,
  data: true,
  meta: true,
  ttc: true,
  variables: true,
  contactAttributes: true,
  singleUseId: true,
  language: true,
  displayId: true,
  endingId: true,
  contact: {
    select: {
      id: true,
      attributes: {
        select: { attributeKey: true, value: true },
      },
    },
  },
  tags: {
    select: {
      tag: {
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          name: true,
          workspaceId: true,
        },
      },
    },
  },
} satisfies Prisma.ResponseSelect;

export const createResponseWithQuotaEvaluation = async (
  responseInput: TResponseInput,
  ingestFlags?: readonly TIngestFlag[],
  // Optional caller-owned transaction — see the comment on the client helper this delegates to.
  txContext?: TCreateResponseTxContext
): Promise<TResponse> => {
  return await createClientResponseWithQuotaEvaluation(
    responseInput,
    { resolveContext: resolveCreateResponseContext, createResponse },
    ingestFlags,
    txContext
  );
};

/** The reads a create needs, made before its transaction opens — see `TClientResponseCreateContext`. */
export const resolveCreateResponseContext = async ({
  workspaceId,
  userId,
}: Pick<TResponseInput, "workspaceId" | "userId">): Promise<TClientResponseCreateContext> => {
  try {
    const organizationId = await getOrganizationIdFromWorkspaceId(workspaceId);
    const organization = await getOrganization(organizationId);
    if (!organization) {
      throw new ResourceNotFoundError("Organization", organizationId);
    }

    const contact: { id: string; attributes: TContactAttributes } | null = userId
      ? await getContactByUserId(workspaceId, userId)
      : null;
    return { contact };
  } catch (error) {
    return handleClientResponseCreateError(error);
  }
};

export const createResponse = async (
  responseInput: TResponseInput,
  { contact }: TClientResponseCreateContext,
  tx: Prisma.TransactionClient,
  ingestFlags?: readonly TIngestFlag[]
): Promise<TResponse> => {
  validateInputs([responseInput, ZResponseInput]);

  const { workspaceId, finished, ttc: initialTtc } = responseInput;

  try {
    const ttc = initialTtc ? (finished ? calculateTtcTotal(initialTtc) : initialTtc) : {};

    if (responseInput.displayId) {
      await assertDisplayOwnership(
        responseInput.displayId,
        workspaceId,
        responseInput.surveyId,
        contact?.id ?? null,
        tx
      );
    }

    const prismaData = buildPrismaResponseData(
      { ...responseInput, createdAt: undefined, updatedAt: undefined },
      contact,
      ttc,
      ingestFlags
    );

    const prismaClient = tx ?? prisma;

    const responsePrisma = await prismaClient.response.create({
      data: prismaData,
      select: responseSelection,
    });

    return buildClientResponse(responsePrisma, contact);
  } catch (error) {
    return handleClientResponseCreateError(error, responseInput.displayId);
  }
};
