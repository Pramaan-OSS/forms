import { type NextRequest } from "next/server";
import { logger } from "@forms/logger";
import { ZDeleteFileRequest, ZDownloadFileRequest } from "@forms/types/storage";
import { responses } from "@/app/lib/api/response";
import { transformErrorToDetails } from "@/app/lib/api/validator";
import { authorizePrivateDownload } from "@/app/storage/[workspaceId]/[accessType]/[...filePath]/lib/auth";
import { resolveClientApiIds } from "@/lib/utils/resolve-client-id";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { deleteFile, getDownloadUrlForDownload } from "@/modules/storage/service";
import { getErrorResponseFromStorageError } from "@/modules/storage/utils";

export const GET = async (
  request: NextRequest,
  props: { params: Promise<{ workspaceId: string; accessType: string; filePath: string[] }> }
): Promise<Response> => {
  const params = await props.params;
  const fileName = params.filePath.join("/");
  const paramValidation = ZDownloadFileRequest.safeParse({
    accessType: params.accessType,
    fileName,
  });

  if (!paramValidation.success) {
    return responses.badRequestResponse(
      "Fields are missing or incorrectly formatted",
      transformErrorToDetails(paramValidation.error),
      true
    );
  }

  const { accessType } = paramValidation.data;
  const idParam = params.workspaceId;

  // Resolve: the URL param may be an environmentId (old uploads) or workspaceId (new uploads)
  const resolved = await resolveClientApiIds(idParam);
  if (!resolved) {
    return responses.notFoundResponse("Workspace", idParam);
  }

  // check auth
  if (accessType === "private") {
    const authResult = await authorizePrivateDownload(request, resolved.workspaceId, "GET", params.filePath);
    if (!authResult.ok) {
      return authResult.error.unauthorized
        ? responses.unauthorizedResponse()
        : responses.notAuthenticatedResponse();
    }
  }

  // Redirect to a short-lived signed URL — try workspaceId path first (new uploads), fall back
  // to environmentId (legacy)
  const urlResult = await getDownloadUrlForDownload(fileName, resolved.workspaceId, accessType, idParam);

  if (!urlResult.ok) {
    const errorResponse = getErrorResponseFromStorageError(urlResult.error, { fileName });
    return errorResponse;
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: urlResult.data,
      "Cache-Control":
        accessType === "private"
          ? "no-store, no-cache, must-revalidate"
          : "public, max-age=31536000, immutable",
    },
  });
};

export const DELETE = async (
  request: NextRequest,
  props: { params: Promise<{ workspaceId: string; accessType: string; filePath: string[] }> }
): Promise<Response> => {
  const params = await props.params;
  const fileName = params.filePath.join("/");
  const paramValidation = ZDeleteFileRequest.safeParse({
    accessType: params.accessType,
    fileName,
  });
  if (!paramValidation.success) {
    const errorDetails = transformErrorToDetails(paramValidation.error);

    return responses.badRequestResponse("Fields are missing or incorrectly formatted", errorDetails, true);
  }

  const { accessType } = paramValidation.data;
  const idParam = params.workspaceId;

  // Resolve: the URL param may be an environmentId (old uploads) or workspaceId (new uploads)
  const resolved = await resolveClientApiIds(idParam);
  if (!resolved) {
    return responses.notFoundResponse("Workspace", idParam);
  }

  const authResult = await authorizePrivateDownload(request, resolved.workspaceId, "DELETE", params.filePath);

  if (!authResult.ok) {
    return authResult.error.unauthorized
      ? responses.unauthorizedResponse()
      : responses.notAuthenticatedResponse();
  }

  // Rate limiting for apiKey DELETE is enforced by Envoy in v5 — see envoy-rate-limit-coverage.ts
  if (authResult.ok && authResult.data.authType !== "apiKey") {
    try {
      await applyRateLimit(rateLimitConfigs.storage.delete, authResult.data.userId);
    } catch (error) {
      return responses.tooManyRequestsResponse(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }

  const deleteResult = await deleteFile(
    resolved.workspaceId,
    accessType,
    decodeURIComponent(fileName),
    idParam
  );

  if (!deleteResult.ok) {
    if (!("error" in deleteResult)) {
      logger.error({ deleteResult }, "Unknown delete failure result shape");

      return responses.internalServerErrorResponse("Failed to delete file", true);
    }

    const { error } = deleteResult;

    logger.error({ error }, "Error deleting file");

    const errorResponse = getErrorResponseFromStorageError(error, { fileName });
    return errorResponse;
  }

  return responses.successResponse("File deleted successfully");
};
