import { TContactAttributes } from "@forms/types/contact-attribute";
import { TResponseContact } from "@forms/types/responses";

export const getContactIdentifier = (
  contact: TResponseContact | null,
  contactAttributes: TContactAttributes | null
): string => {
  return contactAttributes?.email || contact?.userId || "";
};
