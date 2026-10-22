import { getTranslate } from "@/i18n/server";
import { CatalogAppLabel } from "@/modules/connected-apps/components/catalog-app-label";
import { OFFERED_APPS, searchConnectedAppActions } from "@/modules/connected-apps/lib/connected-apps";
import { textToolSettings } from "@/modules/text-tools/service";
import { TextToolSettings } from "@/modules/text-tools/settings";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export default async function Page(props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  const { canManage } = await getWorkspaceAuth(workspaceId);
  const t = await getTranslate();
  const entries = await Promise.all(
    OFFERED_APPS.map(async (app) => ({
      app,
      entries: await searchConnectedAppActions("create", app).catch(() => []),
    }))
  );
  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.integrations")} />
      <p>{t("workspace.integrations.connected_apps_description")}</p>
      {entries.every((item) => item.entries.length === 0) && (
        <p>{t("workspace.integrations.mapping_unavailable")}</p>
      )}
      <div className="grid gap-4 py-6 md:grid-cols-2">
        {entries.map(({ app, entries: actions }) => (
          <a
            className="rounded-lg border bg-white p-5"
            key={app}
            href={
              canManage
                ? `/workspaces/${workspaceId}/settings/workspace/integrations/${app === "googlesheets" ? "google-sheets" : app}`
                : undefined
            }>
            <CatalogAppLabel app={actions[0]?.app} fallback={t("common.connected_apps")} />
          </a>
        ))}
        <a
          className="rounded-lg border bg-white p-5"
          href={`/workspaces/${workspaceId}/settings/workspace/integrations/webhooks`}>
          {t("workspace.integrations.manage_webhooks")}
        </a>
        <a
          className="rounded-lg border bg-white p-5"
          href={`/workspaces/${workspaceId}/settings/workspace/app-connection`}>
          {t("workspace.integrations.website_or_app_integration_description")}
        </a>
      </div>
      <TextToolSettings
        workspaceId={workspaceId}
        initial={await textToolSettings(workspaceId)}
        canManage={canManage}
      />
    </PageContentWrapper>
  );
}
