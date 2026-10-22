import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ZResponseInput } from "@forms/types/responses";

export const ZResponseInputV2 = ZResponseInput.omit({ userId: true }).extend({
  contactId: ZId.nullish(),
  recaptchaToken: z.string().nullish(),
});
export type TResponseInputV2 = z.infer<typeof ZResponseInputV2>;
