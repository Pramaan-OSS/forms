import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { logger } from "@forms/logger";
import { getBetterAuthRequestContext } from "./better-auth-request-context";

/**
 * Auth logging for the Better Auth integration: Better Auth's own logs are
 * routed into the application logger with emails redacted. Error reporting to
 * an outside service was removed with the template's telemetry; everything
 * stays in the application log.
 */

/**
 * Better Auth embeds user email addresses in some log messages — duplicate
 * sign-up attempts log the address verbatim. Redact the local part here rather
 * than relying on the log level, so raising the level for debugging stays safe.
 * The domain is kept: it is the part that carries diagnostic value.
 *
 * Local part is a negated class that EXCLUDES `@`, so the run can only end where the `@` actually is —
 * the engine has no ambiguous split to backtrack through. Domain labels likewise exclude `.`. Both are
 * length-bounded (RFC 5321 limits: 64 for the local part, 63 per label), which caps the work per start
 * position regardless of input.
 */
const EMAIL_IN_MESSAGE = /[^\s@]{1,64}@([\w-]{1,63}(?:\.[\w-]{1,63}){1,8})/g;

export const redactEmailsInLogMessage = (message: unknown): unknown =>
  typeof message === "string" ? message.replace(EMAIL_IN_MESSAGE, "[redacted]@$1") : message;

const SAFE_WARNING_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
]);
const PRISMA_ERROR_CODE = /^P\d{4}$/;

/**
 * Warning causes stay in application logs only as a small allowlisted summary. Passing the Error to
 * Pino's `err` serializer would also emit its message, stack, and enumerable properties, any of which
 * can contain credentials supplied by an upstream provider.
 */
const getSafeWarningErrorContext = (cause: Error): { errorType: string; errorCode?: string } => {
  const errorType = SAFE_WARNING_ERROR_NAMES.has(cause.name) ? cause.name : "Error";
  const code = (cause as Error & { code?: unknown }).code;

  return {
    errorType,
    ...(typeof code === "string" && PRISMA_ERROR_CODE.test(code) && { errorCode: code }),
  };
};

const logWarning = (
  contextLogger: ReturnType<typeof logger.withContext>,
  safeMessage: unknown,
  cause: Error | undefined
): void => {
  if (!cause) {
    contextLogger.warn(safeMessage);
    return;
  }

  contextLogger.warn(
    getSafeWarningErrorContext(cause),
    typeof safeMessage === "string" ? safeMessage : "Better Auth warning"
  );
};

/**
 * Route Better Auth's logger to the application logger. Level stays at "warn"
 * so Better Auth's own info/debug chatter stays out of production logs.
 */
export const betterAuthLogger: NonNullable<BetterAuthOptions["logger"]> = {
  level: "warn",
  disableColors: true,
  log: (level, message, ...args) => {
    const request = getBetterAuthRequestContext();
    const cause = [...args, message].find((arg): arg is Error => arg instanceof Error);
    const contextLogger = logger.withContext({
      source: "better-auth",
      ...(request && { authPath: request.path, httpMethod: request.method }),
    });
    const safeMessage = redactEmailsInLogMessage(message);
    if (level === "error") {
      contextLogger.error(safeMessage);
    } else if (level === "warn") {
      logWarning(contextLogger, safeMessage, cause);
    } else {
      contextLogger.info(safeMessage);
    }
  },
};
