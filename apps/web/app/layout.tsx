import { Metadata } from "next";
import React from "react";
import { NoScriptWarning } from "@/app/components/NoScriptWarning";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/language";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { env } from "@/lib/env";
import { ServerActionNotices } from "@/modules/ui/components/server-action-notices";
import "../modules/ui/globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Forms",
    default: "Forms",
  },
  description: "Open-Source Survey Suite",
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const locale = await getLocale();

  return (
    <html lang={locale} translate="no">
      <body className="flex h-dvh flex-col transition-all ease-in-out">
        <NoScriptWarning locale={locale} />
        <I18nProvider language={locale} defaultLanguage={DEFAULT_LOCALE}>
          {env.PRAMAAN_FAKE === "1" && (
            <p role="status" className="bg-amber-100 p-2 text-center text-sm text-black">
              Test mode. Connected actions stay inside this app.
            </p>
          )}
          {children}
          {/* After the page, so keyboard users reach the notices by tabbing on from its content. */}
          <ServerActionNotices />
        </I18nProvider>
      </body>
    </html>
  );
};

export default RootLayout;
