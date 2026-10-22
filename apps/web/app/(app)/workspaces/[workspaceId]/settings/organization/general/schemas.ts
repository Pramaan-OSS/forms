import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ZOrganizationUpdateInput } from "@forms/types/organizations";

export const ZOrganizationAISettingsInput = ZOrganizationUpdateInput.pick({
  isAISmartToolsEnabled: true,
});

export const ZUpdateOrganizationAISettingsAction = z.object({
  organizationId: ZId,
  data: ZOrganizationAISettingsInput,
});

export const ZOrganizationDisplayTimeZoneInput = ZOrganizationUpdateInput.pick({
  displayTimeZone: true,
});

export const ZUpdateOrganizationDisplayTimeZoneAction = z.object({
  organizationId: ZId,
  data: ZOrganizationDisplayTimeZoneInput,
});
