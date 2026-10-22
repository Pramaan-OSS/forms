import { logger } from "@forms/logger";
import { idempotencyKey, unavailableMessage } from "@forms/pramaan";
import { InvalidInputError } from "@forms/types/errors";
import { MAIL_FROM, MAIL_FROM_NAME } from "@/lib/constants";
import { pramaan } from "@/lib/pramaan";
import { MANAGED_EMAIL_DOMAIN } from "./sender-domain";

// Email types keep logs greppable without leaking recipient content.
export type TEmailType =
  | "invite"
  | "invite_accepted"
  | "email_verification"
  | "sso_recovery_verification"
  | "email_change_verification"
  | "password_reset"
  | "password_reset_notification"
  | "account_deletion"
  | "sso_recovery_notification"
  | "sso_sign_in_hint"
  | "response_notification"
  | "survey_preview"
  | "customization_preview"
  | "verified_survey_link"
  | "survey_follow_up"
  | "workflow_email";

interface SendEmailDataProps {
  emailType: TEmailType;
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html: string;
}

export const sendEmail = async ({ emailType, ...emailData }: SendEmailDataProps): Promise<boolean> => {
  if (!pramaan) {
    logger.info("Email is not configured, skipping email sending");
    return false;
  }
  try {
    const defaultFrom = `${MAIL_FROM_NAME ?? "Forms"} <noreply@${MANAGED_EMAIL_DOMAIN}>`;
    const requestedFrom = emailData.from ?? MAIL_FROM;
    const address = requestedFrom?.match(/^(?:[^<>\r\n]+<)?([^\s<>@\r\n]+@[^\s<>@\r\n]+)>?$/)?.[1];
    const managedAddress = address?.split("@")[1] === MANAGED_EMAIL_DOMAIN;
    // Without a connected sender, an owner's address belongs in replyTo.
    const from = managedAddress
      ? (emailData.from ?? `${MAIL_FROM_NAME ?? "Forms"} <${address}>`)
      : defaultFrom;
    const result = await pramaan.emailSend(
      {
        from,
        to: [emailData.to],
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        replyTo: emailData.replyTo ?? (!managedAddress ? address : undefined),
      },
      // A fresh key per logical send; a retry of this call cannot double-send.
      { idempotencyKey: idempotencyKey() }
    );
    if (result.status && result.status !== "queued" && result.status !== "sent") {
      logger.error({ emailType, status: result.status }, "Email was not accepted for delivery");
      throw new InvalidInputError("The email could not be sent");
    }
    return true;
  } catch (error) {
    // One generic line: never a provider name, a raw response or a stack trace.
    logger.error({ emailType, message: unavailableMessage(error) }, "Error in sendEmail");
    throw new InvalidInputError("The email could not be sent");
  }
};
