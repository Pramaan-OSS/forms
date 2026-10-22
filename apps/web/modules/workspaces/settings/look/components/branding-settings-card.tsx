import { TWorkspace } from "@forms/types/workspace";
import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/i18n/server";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { EditBranding } from "./edit-branding";

interface BrandingSettingsCardProps {
  workspace: TWorkspace;
  isReadOnly: boolean;
}

export const BrandingSettingsCard = async ({
  workspace,
  isReadOnly,
}: Readonly<BrandingSettingsCardProps>) => {
  const t = await getTranslate();

  return (
    <SettingsCard
      title={t("workspace.look.forms_branding")}
      description={t("workspace.look.forms_branding_settings_description")}>
      <div className="space-y-4">
        <EditBranding
          type="linkSurvey"
          isEnabled={workspace.linkSurveyBranding}
          workspaceId={workspace.id}
          isReadOnly={isReadOnly}
        />
        <EditBranding
          type="appSurvey"
          isEnabled={workspace.inAppSurveyBranding}
          workspaceId={workspace.id}
          isReadOnly={isReadOnly}
        />
      </div>
      {isReadOnly && (
        <Alert variant="warning" className="mt-4" role="status">
          <AlertDescription>
            {t("common.only_owners_managers_and_manage_access_members_can_perform_this_action")}
          </AlertDescription>
        </Alert>
      )}
    </SettingsCard>
  );
};
