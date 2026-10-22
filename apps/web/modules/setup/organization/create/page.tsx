import { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthenticationError } from "@forms/types/errors";
import { getTranslate } from "@/i18n/server";
import { getHasNoOrganizations } from "@/lib/instance/service";
import { getOrganizationsByUserId } from "@/lib/organization/service";
import { getUser } from "@/lib/user/service";
import { requiresPasswordConfirmationForAccountDeletion } from "@/modules/account/lib/account-deletion-auth";
import { getSession } from "@/modules/auth/lib/session";
import { RemovedFromOrganization } from "@/modules/setup/organization/create/components/removed-from-organization";
import { ClientLogout } from "@/modules/ui/components/client-logout";
import { CreateOrganization } from "./components/create-organization";

export const metadata: Metadata = {
  title: "Create Organization",
  description: "Open-source Experience Management. Free & open source.",
};

export const CreateOrganizationPage = async () => {
  const t = await getTranslate();
  const session = await getSession();

  if (!session) throw new AuthenticationError(t("common.session_not_found"));

  const user = await getUser(session.user.id);
  if (!user) {
    return <ClientLogout />;
  }

  const hasNoOrganizations = await getHasNoOrganizations();
  const userOrganizations = await getOrganizationsByUserId(session.user.id);

  if (hasNoOrganizations) {
    return <CreateOrganization />;
  }

  if (userOrganizations.length === 0) {
    return (
      <RemovedFromOrganization
        user={user}
        requiresPasswordConfirmation={requiresPasswordConfirmationForAccountDeletion(user)}
      />
    );
  }

  return notFound();
};
