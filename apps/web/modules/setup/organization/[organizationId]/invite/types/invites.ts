import { z } from "zod";
import { ZInvite } from "@forms/database/zod/invites";
import { ZUserName } from "@forms/types/user";

export const ZInvitee = ZInvite.pick({
  name: true,
  email: true,
}).extend({
  name: ZUserName,
});

export type TInvitee = z.infer<typeof ZInvitee>;

export const ZInviteMembersFormSchema = z.record(
  z.string(),
  ZInvite.pick({
    email: true,
    name: true,
  }).extend({
    email: z.email("Invalid email address"),
    name: ZUserName,
  })
);

export type TInviteMembersFormSchema = z.infer<typeof ZInviteMembersFormSchema>;
