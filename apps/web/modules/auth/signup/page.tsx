import { notFound } from "next/navigation";
import {
  EMAIL_AUTH_ENABLED,
  EMAIL_VERIFICATION_DISABLED,
  PRIVACY_URL,
  SIGNUP_ENABLED,
  TERMS_URL,
  WEBAPP_URL,
} from "@/lib/constants";
import { verifyInviteToken } from "@/lib/jwt";
import { findMatchingLocale } from "@/lib/utils/locale";
import { FormWrapper } from "@/modules/auth/components/form-wrapper";
import { managedBackend } from "@/modules/auth/managed/backend";
import { ManagedSignInForm } from "@/modules/auth/managed/form";
import { getIsValidInviteToken } from "@/modules/auth/signup/lib/invite";
import { SignupForm } from "./components/signup-form";

export const SignupPage = async ({
  searchParams: searchParamsProps,
}: {
  searchParams: Promise<Record<string, string>>;
}) => {
  const searchParams = await searchParamsProps;
  const inviteToken = searchParams["inviteToken"] ?? null;
  const locale = await findMatchingLocale();
  if (!SIGNUP_ENABLED) {
    if (!inviteToken) notFound();

    try {
      const { inviteId } = verifyInviteToken(inviteToken);
      const isValidInviteToken = await getIsValidInviteToken(inviteId);

      if (!isValidInviteToken) notFound();
    } catch {
      notFound();
    }
  }

  const backend = managedBackend();
  if (backend) {
    const destination = inviteToken
      ? `${WEBAPP_URL}/invite?token=${encodeURIComponent(inviteToken)}`
      : WEBAPP_URL;
    return (
      <FormWrapper>
        <ManagedSignInForm
          authUrl={backend.authUrl}
          termsUrl={TERMS_URL}
          privacyUrl={PRIVACY_URL}
          appUrl={WEBAPP_URL}
          callbackUrl={destination}
          initialMode="signup"
        />
      </FormWrapper>
    );
  }
  const emailFromSearchParams = searchParams["email"];

  return (
    <FormWrapper>
      <SignupForm
        webAppUrl={WEBAPP_URL}
        termsUrl={TERMS_URL}
        privacyUrl={PRIVACY_URL}
        emailVerificationDisabled={EMAIL_VERIFICATION_DISABLED}
        emailAuthEnabled={EMAIL_AUTH_ENABLED}
        userLocale={locale}
        emailFromSearchParams={emailFromSearchParams}
      />
    </FormWrapper>
  );
};
