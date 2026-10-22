import { ResourceNotFoundError } from "@forms/types/errors";
import { sanitizeThemeStyling } from "@forms/types/styling-values";
import { SettingsCard } from "@/app/(app)/workspaces/[workspaceId]/settings/components/SettingsCard";
import { getTranslate } from "@/i18n/server";
import { cn } from "@/lib/cn";
import { IS_STORAGE_CONFIGURED, SURVEY_BG_COLORS } from "@/lib/constants";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { pramaanConfigured } from "@/lib/pramaan";
import { getWorkspace } from "@/lib/workspace/service";
import { CustomCssQueryClientProvider } from "@/modules/custom-css/components/custom-css-query-client-provider";
import { hasStylesInHeadScripts } from "@/modules/custom-css/components/lib/hints";
import { type TWorkspaceCustomCssAccess } from "@/modules/custom-css/components/types";
import { getCustomCssPlanAllowed } from "@/modules/custom-css/lib/access";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";
import { EditLogo } from "@/modules/workspaces/settings/look/components/edit-logo";
import { BrandingSettingsCard } from "./components/branding-settings-card";
import { EditPlacementForm } from "./components/edit-placement-form";
import { ThemeStyling } from "./components/theme-styling";

export const WorkspaceLookSettingsPage = async (props: { params: Promise<{ workspaceId: string }> }) => {
  const params = await props.params;
  const t = await getTranslate();

  const { canManage, isOwner, isManager } = await getWorkspaceAuth(params.workspaceId);
  // Every card on this page saves through an action that asserts `workspace.manage`.
  const isReadOnly = !canManage;

  const workspace = await getWorkspace(params.workspaceId);

  if (!workspace) {
    throw new ResourceNotFoundError(t("common.workspace"), null);
  }

  const isCustomCssPlanAllowed = await getCustomCssPlanAllowed();
  const publicDomain = getPublicDomain();

  // Mirrors the server's checks for `PATCH …/custom-css` (ENG-2949), which stay authoritative.
  const customCssAccess: TWorkspaceCustomCssAccess = {
    canEdit: isOwner || isManager,
    planAllowed: isCustomCssPlanAllowed,
    // Head scripts exist only on self-hosted, and the check is a plain string match (ENG-3415).
    hasHeadScriptStyles: hasStylesInHeadScripts(workspace.customHeadScripts),
    billingHref: null,
  };

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.appearance")} />
      {!IS_STORAGE_CONFIGURED && (
        <Alert variant="warning" role="status">
          <AlertDescription>{t("common.storage_not_configured")}</AlertDescription>
        </Alert>
      )}
      <SettingsCard
        title={t("workspace.look.theme")}
        className={cn(!isReadOnly && "max-w-7xl")}
        description={t("workspace.look.theme_settings_description")}>
        <CustomCssQueryClientProvider>
          <ThemeStyling
            workspaceId={params.workspaceId}
            // Theme values are not validated on write (ENG-3723), so a stored value that could add CSS
            // (ENG-2950) is dropped before it reaches the form and its preview.
            workspace={{ ...workspace, styling: sanitizeThemeStyling(workspace.styling) }}
            colors={SURVEY_BG_COLORS}
            isImageSearchConfigured={!!pramaanConfigured}
            isReadOnly={isReadOnly}
            isStorageConfigured={IS_STORAGE_CONFIGURED}
            publicDomain={publicDomain}
            customCssAccess={customCssAccess}
          />
        </CustomCssQueryClientProvider>
      </SettingsCard>
      <SettingsCard title={t("common.logo")} description={t("workspace.look.logo_settings_description")}>
        <EditLogo
          workspace={workspace}
          workspaceId={params.workspaceId}
          isReadOnly={isReadOnly}
          isStorageConfigured={IS_STORAGE_CONFIGURED}
        />
      </SettingsCard>
      <SettingsCard
        title={t("workspace.look.app_survey_placement")}
        description={t("workspace.look.app_survey_placement_settings_description")}>
        <EditPlacementForm workspace={workspace} isReadOnly={isReadOnly} />
      </SettingsCard>

      <BrandingSettingsCard workspace={workspace} isReadOnly={isReadOnly} />
    </PageContentWrapper>
  );
};
