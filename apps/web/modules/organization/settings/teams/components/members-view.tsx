import { Suspense } from "react";
import { TOrganizationRole } from "@forms/types/memberships";
import { TOrganization } from "@forms/types/organizations";
import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/i18n/server";
import { INVITE_DISABLED } from "@/lib/constants";
import { EditMemberships } from "@/modules/organization/settings/teams/components/edit-memberships";
import { OrganizationActions } from "@/modules/organization/settings/teams/components/edit-memberships/organization-actions";
import { getMembershipsByUserId } from "@/modules/organization/settings/teams/lib/membership";

interface MembersViewProps {
  membershipRole?: TOrganizationRole;
  organization: TOrganization;
  currentUserId: string;
  isUserManagementDisabledFromUi: boolean;
}

// Carries its own gutter for the same reason the controls above do: the card body is flush.
export const MembersLoading = () => (
  <div className="px-4">
    {Array.from(Array(2)).map((_, index) => (
      <div key={index} className="mt-4">
        <div className={`h-8 w-80 animate-pulse rounded-full bg-slate-200`} />
      </div>
    ))}
  </div>
);

export const MembersView = async ({
  membershipRole,
  organization,
  currentUserId,
  isUserManagementDisabledFromUi,
}: MembersViewProps) => {
  const t = await getTranslate();

  const userMemberships = await getMembershipsByUserId(currentUserId);
  const isLeaveOrganizationDisabled = userMemberships.length <= 1;

  return (
    <SettingsCard
      title={t("workspace.settings.general.manage_members")}
      description={t("workspace.settings.general.manage_members_description")}
      bodyVariant="flush">
      {/* The table is edge-to-edge, so the controls above it carry the card's gutter themselves. */}
      {membershipRole && (
        <div className="px-4 pt-4">
          <OrganizationActions
            organization={organization}
            membershipRole={membershipRole}
            role={membershipRole}
            isLeaveOrganizationDisabled={isLeaveOrganizationDisabled}
            isInviteDisabled={INVITE_DISABLED}
            isUserManagementDisabledFromUi={isUserManagementDisabledFromUi}
          />
        </div>
      )}

      {membershipRole && (
        <Suspense fallback={<MembersLoading />}>
          <EditMemberships
            organization={organization}
            currentUserId={currentUserId}
            role={membershipRole}
            isUserManagementDisabledFromUi={isUserManagementDisabledFromUi}
          />
        </Suspense>
      )}
    </SettingsCard>
  );
};
