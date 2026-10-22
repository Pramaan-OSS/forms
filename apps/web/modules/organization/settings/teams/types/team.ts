import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ZOrganizationRole } from "@forms/types/memberships";

export const ZOrganizationTeam = z.object({
  id: z.cuid2(),
  name: z.string(),
});

export type TOrganizationTeam = z.infer<typeof ZOrganizationTeam>;

export const ZOrganizationMember = z.object({
  id: ZId,
  name: z.string(),
  role: ZOrganizationRole,
});

export type TOrganizationMember = z.infer<typeof ZOrganizationMember>;
