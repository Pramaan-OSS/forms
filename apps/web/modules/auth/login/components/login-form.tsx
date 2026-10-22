"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { FORMS_LOGGED_IN_WITH_LS } from "@/lib/localStorage";
import { authClient } from "@/modules/auth/lib/auth-client";
import { getOAuthErrorVariant } from "@/modules/auth/lib/oauth-error";
import { Alert, AlertDescription, AlertTitle } from "@/modules/ui/components/alert";
import { Button } from "@/modules/ui/components/button";
import { FormControl, FormError, FormField, FormItem, FormLabel } from "@/modules/ui/components/form";
import { Input } from "@/modules/ui/components/input";
import { PasswordInput } from "@/modules/ui/components/password-input";

const ZLoginForm = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, {
      error: "Password must be at least 8 characters long",
    })
    .max(128, {
      error: "Password must be 128 characters or less",
    }),
});

type TLoginForm = z.infer<typeof ZLoginForm>;

interface LoginFormProps {
  emailAuthEnabled: boolean;
  publicSignUpEnabled: boolean;
  passwordResetEnabled: boolean;
  oauthError?: string;
  socialProviders?: { key: string }[];
  enterpriseSignInEnabled?: boolean;
  enterpriseConnectionRef?: string;
  emailJustVerified?: boolean;
  prefilledEmail?: string;
  inviteToken?: string | null;
  resolvedCallbackPath: string;
  resolvedCallbackUrl: string;
}

export const LoginForm = ({
  emailAuthEnabled,
  publicSignUpEnabled,
  passwordResetEnabled,
  oauthError,
  socialProviders = [],
  enterpriseSignInEnabled = false,
  enterpriseConnectionRef,
  emailJustVerified,
  prefilledEmail,
  inviteToken,
  resolvedCallbackPath,
  resolvedCallbackUrl,
}: Readonly<LoginFormProps>) => {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  // Any OAuth callback failure lands here as `?error=<code>`; classify it so the user is told what
  // happened instead of meeting an untouched form.
  const oauthErrorVariant = getOAuthErrorVariant(oauthError);
  const { t } = useTranslation();

  // The `t("…")` calls are written out per variant because `scan-translations` only recognizes literal
  // keys; a key reached through a lookup table reads as unused and fails `pnpm i18n:validate`.
  const oauthErrorAlert = useMemo(() => {
    switch (oauthErrorVariant) {
      case "account_not_linked":
        return {
          title: t("auth.login.oauth_account_not_linked_title"),
          description: t("auth.login.oauth_account_not_linked_description"),
        };
      case "signup_not_allowed":
        return {
          title: t("auth.login.oauth_signup_not_allowed_title"),
          description: t("auth.login.oauth_signup_not_allowed_description"),
        };
      case "misconfigured":
        return {
          title: t("auth.login.oauth_misconfigured_title"),
          description: t("auth.login.oauth_misconfigured_description"),
        };
      case "generic":
        return {
          title: t("auth.login.oauth_generic_error_title"),
          description: t("auth.login.oauth_generic_error_description"),
        };
      default:
        return null;
    }
  }, [oauthErrorVariant, t]);

  const signupHref = useMemo(
    () => (inviteToken ? `/auth/signup?inviteToken=${inviteToken}` : "/auth/signup"),
    [inviteToken]
  );

  const form = useForm<TLoginForm>({
    defaultValues: {
      email: prefilledEmail ?? "",
      password: "",
    },
    resolver: zodResolver(ZLoginForm),
  });

  const onSubmit: SubmitHandler<TLoginForm> = async (data) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FORMS_LOGGED_IN_WITH_LS, "Email");
    }
    try {
      const { error } = await authClient.signIn.email({
        email: data.email.toLowerCase(),
        password: data.password,
        // For an unverified address Better Auth (sendOnSignIn) resends the verification email and builds
        // its link around this callbackURL; without it the post-verify redirect falls back to "/", so an
        // unverified user signing in from an invite/deep-link would lose the original destination.
        callbackURL: resolvedCallbackUrl,
      });

      if (error) {
        // Better Auth (re)sends its own verification email for an unverified address, so we only
        // point the user at their inbox instead of minting a verification token ourselves.
        if (error.code === "EMAIL_NOT_VERIFIED") {
          toast.error(t("auth.login.please_verify_your_email_to_continue"));
          return;
        }
        toast.error(error.message ?? t("common.something_went_wrong"));
        return;
      }

      router.push(resolvedCallbackPath || "/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [showLogin, setShowLogin] = useState(false);
  const [lastLoggedInWith, setLastLoggedInWith] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLastLoggedInWith(localStorage.getItem(FORMS_LOGGED_IN_WITH_LS) || "");
    }
  }, []);

  const formLabel = t("auth.login.login_to_your_account");

  return (
    <FormProvider {...form}>
      <div className="text-center">
        <h1 className="mb-4 text-xl font-normal text-balance text-slate-800">{formLabel}</h1>
        {emailJustVerified && (
          <Alert variant="success" className="mb-4 text-left" role="status">
            <AlertTitle>{t("auth.login.email_verified_sign_in_title")}</AlertTitle>
            <AlertDescription>
              <p>{t("auth.login.email_verified_sign_in_description")}</p>
            </AlertDescription>
          </Alert>
        )}
        {oauthErrorAlert && (
          <Alert variant="error" className="mb-4 text-left" role="status">
            <AlertTitle>{oauthErrorAlert.title}</AlertTitle>
            <AlertDescription>
              <p>{oauthErrorAlert.description}</p>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            {showLogin && (
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="w-full text-left">
                      <FormLabel>{t("common.email")}</FormLabel>
                      <FormControl>
                        <Input
                          ref={emailRef}
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          required
                          name={field.name}
                          value={field.value}
                          onBlur={field.onBlur}
                          onChange={(email) => field.onChange(email)}
                          placeholder="work@email.com"
                        />
                      </FormControl>
                      <FormError role="alert" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="w-full text-left">
                      <FormLabel>{t("common.password")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          autoComplete="current-password"
                          placeholder="*******"
                          required
                          name={field.name}
                          value={field.value}
                          onBlur={field.onBlur}
                          onChange={(password) => field.onChange(password)}
                        />
                      </FormControl>
                      <FormError role="alert" />
                    </FormItem>
                  )}
                />
                {passwordResetEnabled && (
                  <div className="text-right transition-all duration-500 ease-in-out">
                    <Link
                      href="/auth/forgot-password"
                      className="inline-flex min-h-6 items-center rounded-sm py-1 text-sm text-slate-500 hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:outline-hidden">
                      {t("auth.login.forgot_your_password")}
                    </Link>
                  </div>
                )}
              </div>
            )}
            {emailAuthEnabled && (
              <Button
                type={showLogin ? "submit" : "button"}
                onClick={
                  showLogin
                    ? undefined
                    : () => {
                        setShowLogin(true);
                        // Add a slight delay before focusing the input field to ensure it's visible
                        setTimeout(() => emailRef.current?.focus(), 100);
                      }
                }
                className="h-11 w-full min-w-0 justify-center sm:h-9"
                loading={form.formState.isSubmitting}>
                <span className="truncate">{t("auth.login.login_with_email")}</span>
                {lastLoggedInWith && lastLoggedInWith === "Email" ? (
                  <span className="shrink-0 text-xs opacity-50">{t("auth.last_used")}</span>
                ) : null}
              </Button>
            )}
          </form>
        </div>

        {(socialProviders.length > 0 || enterpriseSignInEnabled) && (
          <div className="mt-6 space-y-2">
            {socialProviders.map(({ key }) => (
              <a
                key={key}
                href={`/api/auth/pramaan/${key}`}
                className="flex h-11 w-full min-w-0 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 sm:h-9">
                {t("auth.login.continue_with", { provider: key.charAt(0).toUpperCase() + key.slice(1) })}
              </a>
            ))}
            {enterpriseSignInEnabled && (
              <a
                href={`/api/auth/pramaan/enterprise/${enterpriseConnectionRef ?? ""}`}
                className="flex h-11 w-full min-w-0 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 sm:h-9">
                {t("auth.login.continue_with_work_account")}
              </a>
            )}
          </div>
        )}

        {publicSignUpEnabled && (
          <div className="mt-9 text-center text-xs">
            <span className="leading-5 text-slate-500">{t("auth.login.new_to_forms")}</span>
            <br />
            <Link
              href={signupHref}
              className="inline-flex min-h-6 items-center justify-center rounded-sm py-1 font-semibold text-slate-600 underline hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:outline-hidden">
              {t("auth.login.create_an_account")}
            </Link>
          </div>
        )}
      </div>
    </FormProvider>
  );
};
