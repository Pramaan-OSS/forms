import Link from "next/link";
import { WidgetStatusIndicator } from "@/app/(app)/workspaces/[workspaceId]/components/WidgetStatusIndicator";
import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/i18n/server";
import { WEBAPP_URL } from "@/lib/constants";
import { organizationSettingsPath } from "@/modules/settings/lib/routes";
import { Alert, AlertButton, AlertDescription, AlertTitle } from "@/modules/ui/components/alert";
import { CodeBlock } from "@/modules/ui/components/code-block";
import { IdBadge } from "@/modules/ui/components/id-badge";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const AppConnectionPage = async ({ params }: { params: Promise<{ workspaceId: string }> }) => {
  const t = await getTranslate();
  const { workspaceId } = await params;
  const workspaceIdMigrationUrl = "/";

  const { workspace, organization } = await getWorkspaceAuth(workspaceId);

  const htmlSnippet = `<!-- START Forms Surveys -->
<script type="text/javascript">
!function(){
    var appUrl = "${WEBAPP_URL}";
    var workspaceId = "${workspace.id}";
var t=document.createElement("script");t.type="text/javascript",t.async=!0,t.src=appUrl+"/js/forms.umd.cjs";t.onload=function(){window.forms.setup({workspaceId: workspaceId, appUrl: appUrl})};var e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(t,e)}();
</script>
<!-- END Forms Surveys -->`;

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.web_and_mobile_sdk")} />
      <div className="space-y-4">
        <Alert variant="info" role="status" className="max-w-4xl rounded-xl">
          <AlertTitle>{t("workspace.app-connection.invite_banner_title")}</AlertTitle>
          <AlertDescription>{t("workspace.app-connection.invite_banner_description")}</AlertDescription>
          <AlertButton asChild>
            <Link href={organizationSettingsPath(organization.id, "teams")}>
              {t("workspace.app-connection.invite_banner_button")}
            </Link>
          </AlertButton>
        </Alert>
        <SettingsCard
          title={t("workspace.app-connection.app_connection")}
          description={t("workspace.app-connection.app_connection_description")}>
          {workspace && (
            <div className="space-y-4">
              <WidgetStatusIndicator workspace={workspace} />
              {workspace.appSetupCompleted && (
                <Alert variant="warning" role="status">
                  <AlertTitle>{t("workspace.app-connection.cache_update_delay_title")}</AlertTitle>
                  <AlertDescription>
                    {t("workspace.app-connection.cache_update_delay_description")}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </SettingsCard>
        <SettingsCard
          title={t("workspace.app-connection.workspace_details")}
          description={t("workspace.app-connection.workspace_details_description")}>
          <div className="space-y-3">
            <IdBadge id={workspace.id} label={t("workspace.app-connection.workspace_id")} />
            {workspace.legacyEnvironmentId && (
              <IdBadge
                id={workspace.legacyEnvironmentId}
                label={t("workspace.app-connection.environment_id_legacy")}
              />
            )}
            <IdBadge id={WEBAPP_URL} label={t("workspace.app-connection.webapp_url")} />
            {workspace.legacyEnvironmentId && (
              <Alert variant="info" size="small" role="status">
                <AlertDescription>
                  <p>
                    {t("workspace.app-connection.environment_id_legacy_alert")}{" "}
                    <Link href={workspaceIdMigrationUrl} target="_blank" rel="noopener noreferrer">
                      {t("workspace.app-connection.environment_id_legacy_alert_link")}
                    </Link>
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </SettingsCard>
        <SettingsCard
          title={t("workspace.app-connection.how_to_setup")}
          description={t("workspace.app-connection.how_to_setup_description")}>
          <CodeBlock language="html" noMargin>
            {htmlSnippet}
          </CodeBlock>
        </SettingsCard>
      </div>
    </PageContentWrapper>
  );
};
