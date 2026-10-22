import { redirect } from "next/navigation";
import { WEBAPP_URL } from "@/lib/constants";
import { FormWrapper } from "@/modules/auth/components/form-wrapper";
import { resolveAuthCallbackUrl } from "@/modules/auth/lib/callback-url";
import { managedBackend } from "@/modules/auth/managed/backend";
import { ManagedCallback } from "@/modules/auth/managed/callback";

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const backend = managedBackend();
  if (!backend) redirect("/auth/login");
  const params = await searchParams;
  const callbackUrl =
    resolveAuthCallbackUrl({ searchParamCallbackUrl: params.callbackUrl, webAppUrl: WEBAPP_URL }) ||
    WEBAPP_URL;
  return (
    <FormWrapper>
      <ManagedCallback authUrl={backend.authUrl} callbackUrl={callbackUrl} />
    </FormWrapper>
  );
}
