import { isAPIError } from "better-auth/api";
import { PASSWORD_COMPROMISED_ERROR_CODE } from "@forms/types/errors";

export const isPasswordCompromisedError = (error: unknown): boolean =>
  isAPIError(error) &&
  (error.body as { code?: string } | undefined)?.code === PASSWORD_COMPROMISED_ERROR_CODE;
