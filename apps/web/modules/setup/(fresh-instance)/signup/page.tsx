import { Metadata } from "next";
import { getTranslate } from "@/i18n/server";
import {
  EMAIL_AUTH_ENABLED,
  EMAIL_VERIFICATION_DISABLED,
  PRIVACY_URL,
  TERMS_URL,
  WEBAPP_URL,
} from "@/lib/constants";
import { findMatchingLocale } from "@/lib/utils/locale";
import { managedBackend } from "@/modules/auth/managed/backend";
import { ManagedSignInForm } from "@/modules/auth/managed/form";
import { SignupForm } from "@/modules/auth/signup/components/signup-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Open-source Experience Management. Free & open source.",
};

export const SignupPage = async () => {
  const backend = managedBackend();
  if (backend)
    return (
      <ManagedSignInForm
        authUrl={backend.authUrl}
        termsUrl={TERMS_URL}
        privacyUrl={PRIVACY_URL}
        appUrl={WEBAPP_URL}
        callbackUrl={WEBAPP_URL}
        initialMode="signup"
      />
    );
  const locale = await findMatchingLocale();

  const t = await getTranslate();
  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-6 text-xl font-normal">{t("setup.signup.create_administrator")}</h2>
      <p className="text-sm text-slate-800">{t("setup.signup.this_user_has_all_the_power")}</p>
      <hr className="my-6 w-full border-slate-200" />
      <SignupForm
        webAppUrl={WEBAPP_URL}
        termsUrl={TERMS_URL}
        privacyUrl={PRIVACY_URL}
        emailVerificationDisabled={EMAIL_VERIFICATION_DISABLED}
        emailAuthEnabled={EMAIL_AUTH_ENABLED}
        userLocale={locale}
      />
    </div>
  );
};
