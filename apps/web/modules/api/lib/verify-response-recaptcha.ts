import "server-only";
import { logger } from "@forms/logger";
import { TSurvey } from "@forms/types/surveys/types";
import { verifyRecaptchaToken } from "@/app/api/v2/client/[workspaceId]/responses/lib/recaptcha";
import { responses } from "@/app/lib/api/response";

export const RECAPTCHA_VERIFICATION_ERROR_CODE = "recaptcha_verification_failed";

/**
 * Shared reCAPTCHA gate for the public response-submission endpoints.
 *
 * This lives in one place on purpose: the check was originally implemented only inside the v2
 * endpoint's `checkSurveyValidity`, while `POST /api/v1/client/{workspaceId}/responses` accepts
 * responses for the same surveys with no reCAPTCHA check at all. Both endpoints are public and
 * unauthenticated, so a caller could opt out of a survey's spam protection just by posting to the v1
 * URL. Keeping a single implementation is what stops the two versions drifting apart again.
 *
 * @returns an error `Response` when the request must be rejected, otherwise `null`.
 */
export const verifyResponseRecaptcha = async ({
  survey,
  recaptchaToken,
}: {
  survey: TSurvey;
  recaptchaToken?: string | null;
}): Promise<Response | null> => {
  if (!survey.recaptcha?.enabled) {
    return null;
  }

  if (!recaptchaToken) {
    // warn, not error: a public endpoint receiving a request without a token is an ordinary
    // caller-controlled condition, not an application fault, and erroring on it lets anyone fill the
    // error log by posting an empty body.
    logger.warn("Missing challenge token");
    return responses.badRequestResponse(
      "Missing challenge token",
      { code: RECAPTCHA_VERIFICATION_ERROR_CODE },
      true
    );
  }

  const isPassed = await verifyRecaptchaToken(recaptchaToken, survey.recaptcha.threshold);
  if (!isPassed) {
    return responses.badRequestResponse(
      "Challenge verification failed",
      { code: RECAPTCHA_VERIFICATION_ERROR_CODE },
      true
    );
  }

  return null;
};
