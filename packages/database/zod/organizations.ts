import { z } from "zod";
import type { Organization } from "../src/prisma";

export const ZOrganizationWhiteLabel = z.object({
  logoUrl: z.string().nullable(),
});

export const ZOrganization = z.object({
  id: z.cuid2(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  name: z.string(),
  whitelabel: ZOrganizationWhiteLabel,
  isAISmartToolsEnabled: z.boolean().default(false),
  displayTimeZone: z.string().nullable(),
}) satisfies z.ZodType<Organization>;
