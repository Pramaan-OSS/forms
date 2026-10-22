import { DEFAULT_SERVER_ERROR_MESSAGE, createSafeActionClient } from "next-safe-action";
import { logger } from "@forms/logger";
import { AuthenticationError, AuthorizationError, isExpectedError } from "@forms/types/errors";
import { withAuthorizationSurface } from "@/lib/authorization/context";
import { getUser } from "@/lib/user/service";
import { getSession } from "@/modules/auth/lib/session";
import { ActionClientCtx } from "./types/context";

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (isExpectedError(e)) {
      return e.message;
    }

    logger.error(e, "SERVER ERROR");
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
}).use(async ({ next }) => {
  const ctx: ActionClientCtx = {};

  return next({ ctx });
});

export const authenticatedActionClient = actionClient.use(async ({ ctx, next }) => {
  const session = await getSession();
  if (!session?.user) {
    throw new AuthenticationError("Not authenticated");
  }

  const userId = session.user.id;

  const user = await getUser(userId);
  if (!user) {
    throw new AuthorizationError("User not found");
  }

  return withAuthorizationSurface("server_action", () => next({ ctx: { ...ctx, user } }));
});
