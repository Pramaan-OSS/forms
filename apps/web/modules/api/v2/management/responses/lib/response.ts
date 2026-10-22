import "server-only";
import { prisma } from "@forms/database";
import { Prisma, Response } from "@forms/database/prisma";
import { TContactAttributes } from "@forms/types/contact-attribute";
import { Result, err, ok } from "@forms/types/error-handlers";
import { calculateTtcTotal, normalizeResponseLanguage } from "@/lib/response/utils";
import { getContactByUserId } from "@/modules/api/v2/management/responses/lib/contact";
import {
  getOrganizationBilling,
  getOrganizationIdFromWorkspaceId,
} from "@/modules/api/v2/management/responses/lib/organization";
import { getResponsesQuery } from "@/modules/api/v2/management/responses/lib/utils";
import { TGetResponsesFilter, TResponseInput } from "@/modules/api/v2/management/responses/types/responses";
import { ApiErrorResponseV2 } from "@/modules/api/v2/types/api-error";
import { ApiResponseWithMeta } from "@/modules/api/v2/types/api-success";

export const getResponses = async (
  workspaceIds: string[],
  params: TGetResponsesFilter,
  /** ENG-3282: the API key's visibility clause on the response's survey. */
  visibleSurveyWhere: Prisma.SurveyWhereInput = {}
): Promise<Result<ApiResponseWithMeta<Response[]>, ApiErrorResponseV2>> => {
  try {
    const query = getResponsesQuery(workspaceIds, params, visibleSurveyWhere);
    const whereClause = query.where;

    const [responses, totalCount] = await Promise.all([
      prisma.response.findMany(query),
      prisma.response.count({ where: whereClause }),
    ]);

    return ok({
      data: responses,
      meta: {
        total: totalCount,
        limit: params.limit,
        offset: params.skip,
      },
    });
  } catch (error) {
    return err({
      type: "internal_server_error",
      details: [
        { field: "responses", issue: error instanceof Error ? error.message : "Unknown error occurred" },
      ],
    });
  }
};

/**
 * What a create reads before its transaction opens: the contact the response links to, and the
 * workspace's organization with its billing row (both checked to exist). These go through the root
 * client, so reading them inside the transaction would check out a second pool connection while the
 * transaction holds the first, and on a saturated pool that read queues behind the very transaction
 * waiting for it (ENG-3722).
 *
 * Each is kept as a `Result` rather than failing the resolve, so `createResponse` still reports the
 * failures in the order it always has: display, then contact, then organization.
 */
export type TCreateResponseContext = {
  contact: Result<{ id: string; attributes: TContactAttributes } | null, ApiErrorResponseV2>;
  organization: Result<string, ApiErrorResponseV2>;
};

const NO_CONTACT: TCreateResponseContext["contact"] = ok(null);

const resolveOrganization = async (workspaceId: string): Promise<Result<string, ApiErrorResponseV2>> => {
  const organizationIdResult = await getOrganizationIdFromWorkspaceId(workspaceId);
  if (!organizationIdResult.ok) {
    return err(organizationIdResult.error as ApiErrorResponseV2);
  }

  const billing = await getOrganizationBilling(organizationIdResult.data);
  if (!billing.ok) {
    return err(billing.error as ApiErrorResponseV2);
  }

  return ok(organizationIdResult.data);
};

/** The reads a create needs, made before its transaction opens — see `TCreateResponseContext`. */
export const resolveCreateResponseContext = async (
  workspaceId: string,
  userId: string | null | undefined
): Promise<TCreateResponseContext> => {
  const [contact, organization] = await Promise.all([
    userId ? getContactByUserId(workspaceId, userId) : NO_CONTACT,
    resolveOrganization(workspaceId),
  ]);
  return { contact, organization };
};

export const createResponse = async (
  responseInput: TResponseInput,
  context: TCreateResponseContext,
  tx?: Prisma.TransactionClient
): Promise<Result<Response, ApiErrorResponseV2>> => {
  const {
    surveyId,
    displayId,
    finished,
    data,
    language,
    meta,
    singleUseId,
    variables,
    ttc: initialTtc,
    createdAt,
    updatedAt,
    endingId,
  } = responseInput;

  try {
    // `displayId` is caller-supplied and was connected without any ownership check. Display↔Response is
    // one-to-one, so naming another workspace's display either failed outright or moved that display
    // onto this response, corrupting the other tenant's display and completion counts. A display always
    // belongs to one survey, so matching it against this survey is the tightest check available.
    if (displayId) {
      const display = await (tx ?? prisma).display.findUnique({
        where: { id: displayId },
        select: { surveyId: true },
      });

      // Uniform not-found for "does not exist" and "exists but belongs elsewhere". Distinguishing the
      // two would confirm that a display id is real, making this endpoint a cross-tenant existence
      // oracle — the same reason the historical-response import raises not-found rather than forbidden
      // (#8679). Matches the shape the sibling handlers already return for a foreign display.
      if (display?.surveyId !== surveyId) {
        return err({
          type: "not_found",
          details: [{ field: "display", issue: "not found" }],
        });
      }
    }

    if (!context.contact.ok) {
      return err(context.contact.error);
    }
    const contact = context.contact.data;

    let ttc = {};
    if (initialTtc) {
      if (finished) {
        ttc = calculateTtcTotal(initialTtc);
      } else {
        ttc = initialTtc;
      }
    }

    const prismaData: Prisma.ResponseCreateInput = {
      survey: {
        connect: {
          id: surveyId,
        },
      },
      display: displayId ? { connect: { id: displayId } } : undefined,
      ...(contact?.id && {
        contact: {
          connect: {
            id: contact.id,
          },
        },
        contactAttributes: contact.attributes,
      }),
      finished,
      data,
      language: normalizeResponseLanguage(language),
      meta,
      singleUseId,
      variables,
      ttc,
      createdAt,
      updatedAt,
      endingId,
    };

    if (!context.organization.ok) {
      return err(context.organization.error);
    }

    const prismaClient = tx ?? prisma;

    const response = await prismaClient.response.create({
      data: prismaData,
    });

    return ok(response);
  } catch (error) {
    return err({
      type: "internal_server_error",
      details: [
        { field: "response", issue: error instanceof Error ? error.message : "Unknown error occurred" },
      ],
    });
  }
};

export const createResponseWithQuotaEvaluation = async (
  workspaceId: string,
  responseInput: TResponseInput
): Promise<Result<Response, ApiErrorResponseV2>> => {
  const responseContext = await resolveCreateResponseContext(workspaceId, responseInput.userId);
  return prisma.$transaction<Result<Response, ApiErrorResponseV2>>(async (tx) =>
    createResponse(responseInput, responseContext, tx)
  );
};
