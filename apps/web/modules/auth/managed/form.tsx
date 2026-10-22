"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TermsPrivacyLinks } from "@/modules/auth/signup/components/terms-privacy-links";
import { Button } from "@/modules/ui/components/button";
import { Input } from "@/modules/ui/components/input";
import { PasswordInput } from "@/modules/ui/components/password-input";
import { managedClient, managedSessionToken } from "./client";

export function ManagedSignInForm({
  authUrl,
  appUrl,
  callbackUrl,
  initialMode = "signin",
  termsUrl,
  privacyUrl,
}: Readonly<{
  authUrl: string;
  appUrl: string;
  callbackUrl: string;
  initialMode?: "signin" | "signup";
  termsUrl?: string;
  privacyUrl?: string;
}>) {
  const { t } = useTranslation();
  const client = useMemo(() => managedClient(authUrl), [authUrl]);
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returnUrl = new URL("/auth/managed/callback", appUrl);
  returnUrl.searchParams.set("callbackUrl", callbackUrl);
  const complete = async () => {
    const token = await managedSessionToken(client);
    const response = await fetch("/api/auth/managed/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, callbackUrl }),
    });
    if (!response.ok) throw new Error();
    const result = await response.json();
    window.location.assign(result.destination);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError(t("auth.managed.failed"));
      setBusy(false);
    }
  };
  return (
    <div className="w-full space-y-5">
      <h1 className="text-center text-xl font-normal text-slate-800">
        {mode === "signup" ? t("auth.signup.title") : t("auth.login.login_to_your_account")}
      </h1>
      <Button
        className="w-full"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const result = await client.signIn.social({
              provider: "google",
              callbackURL: returnUrl.toString(),
            });
            if (result.error) throw new Error();
          })
        }>
        {t("auth.managed.continue")}
      </Button>
      <p className="text-center text-sm text-slate-600">{t("auth.login.login_with_email")}</p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result =
              mode === "signup"
                ? await client.signUp.email({ name, email, password, callbackURL: returnUrl.toString() })
                : await client.signIn.email({ email, password, callbackURL: returnUrl.toString() });
            if (result.error) throw new Error();
            await complete();
          });
        }}>
        {mode === "signup" && (
          <label className="block text-sm">
            {t("common.name")}
            <Input
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <label className="block text-sm">
          {t("common.email")}
          <Input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          {t("common.password")}
          <PasswordInput
            required
            minLength={8}
            maxLength={128}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button className="w-full" type="submit" disabled={busy}>
          {busy
            ? t("common.loading")
            : mode === "signup"
              ? t("auth.login.create_an_account")
              : t("auth.signup.log_in")}
        </Button>
      </form>
      <TermsPrivacyLinks termsUrl={termsUrl} privacyUrl={privacyUrl} />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        className="block w-full text-center text-sm underline"
        disabled={busy}
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError("");
        }}>
        {mode === "signup" ? t("auth.signup.log_in") : t("auth.login.create_an_account")}
      </button>
      <Link
        className="block text-center text-sm text-slate-600 underline"
        href={`/auth/login?local=1&callbackUrl=${encodeURIComponent(callbackUrl)}`}>
        {t("auth.managed.other_options")}
      </Link>
    </div>
  );
}
