import { Metadata } from "next";
import {
  EMAIL_AUTH_ENABLED,
  PASSWORD_RESET_DISABLED,
  PRIVACY_URL,
  SIGNUP_ENABLED,
  TERMS_URL,
  WEBAPP_URL,
} from "@/lib/constants";
import { env } from "@/lib/env";
import { pramaan } from "@/lib/pramaan";
import { FormWrapper } from "@/modules/auth/components/form-wrapper";
import {
  getInviteTokenFromCallbackUrl,
  getRelativeCallbackUrl,
  getSearchParamString,
  resolveAuthCallbackUrl,
} from "@/modules/auth/lib/callback-url";
import { parseSocialSignInConfig } from "@/modules/auth/lib/pramaan-signin/config";
import { managedBackend } from "@/modules/auth/managed/backend";
import { ManagedSignInForm } from "@/modules/auth/managed/form";
import { LoginForm } from "./components/login-form";

export const metadata: Metadata = {
  title: "Login",
  description: "Open-source Experience Management. Free & open source.",
};

export const LoginPage = async ({
  searchParams: searchParamsProps,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) => {
  const searchParams = await searchParamsProps;
  const oauthError = getSearchParamString(searchParams.error);

  const resolvedCallbackUrl =
    resolveAuthCallbackUrl({
      searchParamCallbackUrl: searchParams.callbackUrl,
      webAppUrl: WEBAPP_URL,
    }) ?? WEBAPP_URL;
  const resolvedCallbackPath = getRelativeCallbackUrl(resolvedCallbackUrl, WEBAPP_URL);
  const inviteToken = getInviteTokenFromCallbackUrl(resolvedCallbackUrl, WEBAPP_URL);

  const backend = managedBackend();
  if (backend && getSearchParamString(searchParams.local) !== "1") {
    return (
      <FormWrapper>
        <ManagedSignInForm
          authUrl={backend.authUrl}
          termsUrl={TERMS_URL}
          privacyUrl={PRIVACY_URL}
          appUrl={WEBAPP_URL}
          callbackUrl={resolvedCallbackUrl}
        />
      </FormWrapper>
    );
  }

  // Social sign-in is on only when configured; enterprise sign-in shows its one
  // saved connection, read live from the platform when a key is set.
  const socialProviders = parseSocialSignInConfig(env.PRAMAAN_SOCIAL_SIGN_IN);
  let enterpriseConnectionRef: string | undefined;
  if (pramaan && env.PRAMAAN_ENTERPRISE_SIGN_IN === "1") {
    try {
      const list = (await pramaan.call("auth.enterprise-connections.list", {})) as {
        results?: { ref?: string }[];
      };
      if (list.results?.length === 1) {
        enterpriseConnectionRef = list.results[0]?.ref;
      }
    } catch {
      // No usable list means no enterprise button; the error stays a log line at most.
    }
  }

  return (
    <FormWrapper>
      <LoginForm
        emailAuthEnabled={EMAIL_AUTH_ENABLED}
        publicSignUpEnabled={SIGNUP_ENABLED}
        passwordResetEnabled={!PASSWORD_RESET_DISABLED}
        oauthError={oauthError}
        socialProviders={socialProviders.map(({ key }) => ({ key }))}
        enterpriseSignInEnabled={Boolean(enterpriseConnectionRef)}
        enterpriseConnectionRef={enterpriseConnectionRef}
        // ENG-2562: set when a verification succeeded but the session was withheld, because the
        // browser presenting the link was not the one that signed up. Without it the user is bounced
        // here with no explanation right after being told their address was verified.
        emailJustVerified={getSearchParamString(searchParams.verified) === "1"}
        prefilledEmail={getSearchParamString(searchParams.email)}
        inviteToken={inviteToken}
        resolvedCallbackPath={resolvedCallbackPath}
        resolvedCallbackUrl={resolvedCallbackUrl}
      />
    </FormWrapper>
  );
};
