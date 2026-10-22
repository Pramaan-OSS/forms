import { Metadata } from "next";
import Link from "next/link";
import { getTranslate } from "@/i18n/server";
import { Button } from "@/modules/ui/components/button";

export const metadata: Metadata = {
  title: "Intro",
  description: "Create surveys and collect responses with Forms.",
};

export const IntroPage = async () => {
  const t = await getTranslate();
  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-6 text-xl font-normal">{t("setup.intro.welcome_to_forms")}</h2>
      <div className="mx-auto max-w-sm space-y-4 text-sm leading-6 text-slate-600">
        <p dangerouslySetInnerHTML={{ __html: t("setup.intro.paragraph_1") }} />
        <p dangerouslySetInnerHTML={{ __html: t("setup.intro.paragraph_2") }} />
        <p dangerouslySetInnerHTML={{ __html: t("setup.intro.paragraph_3") }} />
      </div>
      <Button className="mt-6" asChild>
        <Link href="/setup/signup">{t("setup.intro.get_started")}</Link>
      </Button>
    </div>
  );
};
