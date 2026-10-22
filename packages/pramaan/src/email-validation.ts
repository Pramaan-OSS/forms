import type { Caps } from "./capabilities";

/** Offline email contract checks; uploaded byte ownership is checked by the server. */
export function validateEmailSend(value: unknown): void {
  const input = value as Caps.EmailSendRequest;
  const fail = (detail: string): never => {
    throw new Error(`Invalid email request: ${detail}`);
  };
  if (input.attachments) {
    if (input.attachments.length > 10) fail("at most 10 attachments");
    for (const file of input.attachments) {
      if (!/^file_[0-9A-HJKMNP-TV-Z]{26}$/.test(file.fileId) || !file.name || file.name.length > 200)
        fail("attachment fileId or name");
    }
  }
  const invitation = input.invitation;
  if (!invitation) return;
  const sender = input.from.match(/<([^<>]+)>\s*$/)?.[1] || input.from;
  if (invitation.organiser.toLowerCase() !== sender.trim().toLowerCase())
    fail("invitation.organiser must match from");
  const recipients = [
    ...(Array.isArray(input.to) ? input.to : [input.to]),
    ...(Array.isArray(input.cc) ? input.cc : input.cc ? [input.cc] : []),
  ].map((email) => email.toLowerCase());
  if (
    !invitation.attendees.length ||
    invitation.attendees.length > 50 ||
    invitation.attendees.some((email) => !recipients.includes(email.toLowerCase()))
  )
    fail("invitation.attendees must be in to or cc");
  if (!invitation.uid || invitation.uid.length > 255 || !invitation.title || invitation.title.length > 998)
    fail("invitation.uid or title");
  const instant = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/;
  if (
    ![invitation.start, invitation.end].every(
      (time) => instant.test(time) && Number.isFinite(Date.parse(time))
    ) ||
    Date.parse(invitation.end) <= Date.parse(invitation.start)
  )
    fail("invitation.start/end must be whole-second instants in order");
  try {
    new Intl.DateTimeFormat("en", { timeZone: invitation.timeZone });
  } catch {
    fail("invitation.timeZone");
  }
  if (!["request", "cancel"].includes(invitation.method)) fail("invitation.method");
  const sequence = invitation.sequence ?? 0;
  if (
    !Number.isInteger(sequence) ||
    sequence < (invitation.method === "cancel" ? 1 : 0) ||
    sequence > 2147483647
  )
    fail("invitation.sequence");
}
