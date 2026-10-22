import { redirect } from "next/navigation";
import type { Session } from "@forms/types/auth";
import { getTranslate } from "@/i18n/server";
import { BackToLoginButton } from "@/modules/auth/components/back-to-login-button";
import { FormWrapper } from "@/modules/auth/components/form-wrapper";
import { getSession } from "@/modules/auth/lib/session";

export const EmailChangeWithoutVerificationSuccessPage = async () => {
  const t = await getTranslate();
  const session: Session | null = await getSession();

  if (session) {
    redirect("/");
  }

  return (
    <FormWrapper>
      <h1 className="mb-4 text-center leading-2 font-normal">
        {t("auth.email-change.email_change_success")}
      </h1>
      <p className="text-center text-sm">{t("auth.email-change.email_change_success_description")}</p>
      <hr className="my-4" />
      <BackToLoginButton />
    </FormWrapper>
  );
};
