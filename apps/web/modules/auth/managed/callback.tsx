"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { managedClient, managedSessionToken } from "./client";

export function ManagedCallback({
  authUrl,
  callbackUrl,
}: Readonly<{ authUrl: string; callbackUrl: string }>) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await managedSessionToken(managedClient(authUrl));
        if (controller.signal.aborted) return;
        const response = await fetch("/api/auth/managed/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, callbackUrl }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!controller.signal.aborted) window.location.replace(body.destination);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [authUrl, callbackUrl]);
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-xl font-normal">
        {failed ? t("auth.login.oauth_generic_error_title") : t("auth.managed.finishing")}
      </h1>
      {failed && (
        <a className="underline" href="/auth/login">
          {t("auth.signup.log_in")}
        </a>
      )}
    </div>
  );
}
