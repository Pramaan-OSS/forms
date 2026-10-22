import { TUser } from "@forms/types/user";

export type ActionClientCtx = {
  user?: TUser;
};

export type AuthenticatedActionClientCtx = ActionClientCtx & {
  user: TUser;
};
