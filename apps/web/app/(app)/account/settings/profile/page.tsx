import { AuthenticationError } from "@forms/types/errors";
import { DeleteAccount } from "@/app/(app)/workspaces/[workspaceId]/settings/account/profile/components/DeleteAccount";
import { EditProfileDetailsForm } from "@/app/(app)/workspaces/[workspaceId]/settings/account/profile/components/EditProfileDetailsForm";
import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/i18n/server";
import { EMAIL_VERIFICATION_DISABLED, PASSWORD_RESET_DISABLED } from "@/lib/constants";
import { getOrganizationsWhereUserIsSingleOwner } from "@/lib/organization/service";
import { getUser } from "@/lib/user/service";
import { requiresPasswordConfirmationForAccountDeletion } from "@/modules/account/lib/account-deletion-auth";
import { getSession } from "@/modules/auth/lib/session";
import { IdBadge } from "@/modules/ui/components/id-badge";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";

const Page = async () => {
  const t = await getTranslate();
  const session = await getSession();
  if (!session?.user) {
    throw new AuthenticationError(t("common.not_authenticated"));
  }

  const organizationsWithSingleOwner = await getOrganizationsWhereUserIsSingleOwner(session.user.id);
  const user = await getUser(session.user.id);
  if (!user) {
    throw new AuthenticationError(t("common.not_authenticated"));
  }

  const isPasswordResetEnabled = !PASSWORD_RESET_DISABLED && user.identityProvider === "email";
  const requiresPasswordConfirmation = requiresPasswordConfirmationForAccountDeletion(user);

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.profile")} />
      <div>
        <SettingsCard
          title={t("workspace.settings.profile.personal_information")}
          description={t("workspace.settings.profile.update_personal_info")}>
          <EditProfileDetailsForm
            user={user}
            emailVerificationDisabled={EMAIL_VERIFICATION_DISABLED}
            isPasswordResetEnabled={isPasswordResetEnabled}
          />
        </SettingsCard>

        <SettingsCard
          title={t("workspace.settings.profile.delete_account")}
          description={t("workspace.settings.profile.confirm_delete_account")}>
          <DeleteAccount
            session={session}
            user={user}
            organizationsWithSingleOwner={organizationsWithSingleOwner}
            isMultiOrgEnabled
            requiresPasswordConfirmation={requiresPasswordConfirmation}
          />
        </SettingsCard>
        <IdBadge id={user.id} label={t("common.profile_id")} variant="column" />
      </div>
    </PageContentWrapper>
  );
};

export default Page;
