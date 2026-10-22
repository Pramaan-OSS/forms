import Link from "next/link";
import { getTranslate } from "@/i18n/server";
import { Logo } from "@/modules/ui/components/logo";

interface FormWrapperProps {
  children: React.ReactNode;
}

/**
 * The one shell every signed-out screen renders inside. It owns the backdrop and the
 * centring so each auth page stays a bare form — before ENG-2428 login and signup each
 * repeated their own full-screen wrapper and two routes hand-copied a second one.
 *
 * Mobile-first: `min-h-dvh` rather than `min-h-screen`, because `100vh` on mobile is the
 * *large* viewport, which pushes a vertically centred card under the browser chrome.
 */
export const FormWrapper = async ({ children }: Readonly<FormWrapperProps>) => {
  const t = await getTranslate();

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-auth-backdrop px-4 py-8 sm:px-6 sm:py-12">
      <main className="forms-island w-full max-w-sm rounded-xl p-6 sm:p-8">
        <div className="mb-8 text-center">
          <Link
            href="/"
            rel="noopener noreferrer"
            aria-label={t("common.forms_homepage")}
            className="inline-block rounded-md focus-visible:ring-2 focus-visible:ring-brand-dark focus-visible:ring-offset-2 focus-visible:outline-hidden">
            <Logo aria-hidden="true" className="mx-auto w-40 sm:w-48" />
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
};
