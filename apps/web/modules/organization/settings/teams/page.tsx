import { getTranslate } from "@/i18n/server";
import { USER_MANAGEMENT_MINIMUM_ROLE } from "@/lib/constants";
import { getUserManagementAccess } from "@/lib/membership/utils";
import { getOrganizationAuth } from "@/modules/organization/lib/utils";
import { MembersView } from "@/modules/organization/settings/teams/components/members-view";
import { redirectBillingRoleFromRestrictedOrgSettings } from "@/modules/settings/lib/redirect-billing-role";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";

export const TeamsPage = async (props: Readonly<{ params: Promise<{ organizationId: string }> }>) => {
  const params = await props.params;
  const t = await getTranslate();

  await redirectBillingRoleFromRestrictedOrgSettings(params.organizationId);

  const { session, currentUserMembership, organization } = await getOrganizationAuth(params.organizationId);

  // Check if user has standard user management access (owner/manager)
  const hasUserManagementAccess = getUserManagementAccess(
    currentUserMembership?.role,
    USER_MANAGEMENT_MINIMUM_ROLE
  );

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.teams")} />
      <MembersView
        membershipRole={currentUserMembership?.role}
        organization={organization}
        currentUserId={session.user.id}
        isUserManagementDisabledFromUi={!hasUserManagementAccess}
      />
    </PageContentWrapper>
  );
};
