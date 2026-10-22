import { TAuthenticationApiKey } from "@forms/types/auth";
import { handleApiError, logApiRequest } from "@/modules/api/v2/lib/utils";
import { ApiErrorResponseV2 } from "@/modules/api/v2/types/api-error";
import { ExtendedSchemas, HandlerFn, ParsedSchemas, apiWrapper } from "./api-wrapper";

export const authenticatedApiClient = async <S extends ExtendedSchemas>({
  request,
  schemas,
  externalParams,
  rateLimit = true,
  handler,
  bodyTransform,
  allowOrganizationOnlyApiKey = false,
}: {
  request: Request;
  schemas?: S;
  externalParams?: Promise<Record<string, any>>;
  rateLimit?: boolean;
  handler: HandlerFn<ParsedSchemas<S>>;
  bodyTransform?: (
    body: Record<string, unknown>,
    auth: TAuthenticationApiKey
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /**
   * Forwarded to {@link apiWrapper}. Set to true on organization-scoped endpoints so API
   * keys with only organization access (no workspace permissions) can authenticate.
   */
  allowOrganizationOnlyApiKey?: boolean;
}): Promise<Response> => {
  try {
    const response = await apiWrapper({
      request,
      schemas,
      externalParams,
      rateLimit,
      handler,
      bodyTransform,
      allowOrganizationOnlyApiKey,
    });

    if (response.ok) {
      logApiRequest(request, response.status);
    }

    return response;
  } catch (err) {
    if (err !== null && typeof err === "object" && "type" in err) {
      return handleApiError(request, err as ApiErrorResponseV2, err);
    }

    return handleApiError(
      request,
      {
        type: "internal_server_error",
        details: [
          {
            field: "error",
            issue: "An error occurred while processing your request. Please try again later.",
          },
        ],
      },
      err
    );
  }
};
