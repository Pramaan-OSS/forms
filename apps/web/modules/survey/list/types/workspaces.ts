import { Workspace } from "@forms/database/prisma";

export interface TUserWorkspace extends Pick<Workspace, "id" | "name"> {}
