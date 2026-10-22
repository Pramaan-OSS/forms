import "server-only";
import type { User } from "@forms/database/prisma";

type TAccountDeletionPasswordAuthData = Pick<User, "identityProvider">;

export const requiresPasswordConfirmationForAccountDeletion = ({
  identityProvider,
}: TAccountDeletionPasswordAuthData): boolean => identityProvider === "email";
