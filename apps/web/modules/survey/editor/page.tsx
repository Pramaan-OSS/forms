import { ResourceNotFoundError } from "@forms/types/errors";
import { type TSurvey } from "@forms/types/surveys/types";
import { getTranslate } from "@/i18n/server";
import { DEFAULT_LOCALE, IS_STORAGE_CONFIGURED, MAIL_FROM, SURVEY_BG_COLORS } from "@/lib/constants";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { pramaanConfigured } from "@/lib/pramaan";
import { getCustomCssSource } from "@/modules/custom-css/components/lib/draft";
import { hasStylesInHeadScripts } from "@/modules/custom-css/components/lib/hints";
import { type TSurveyCustomCssEditorConfig } from "@/modules/custom-css/components/types";
import { getCustomCssPlanAllowed } from "@/modules/custom-css/lib/access";
import { getCustomCssHealth, toDeliveredCustomCss } from "@/modules/custom-css/lib/delivery";
import { getWorkspaceCustomCssRecord, parseStoredCustomCss } from "@/modules/custom-css/lib/service";
import { getTeamMemberDetails } from "@/modules/survey/editor/lib/team";
import { getUserEmail } from "@/modules/survey/editor/lib/user";
import { getWorkspaceLanguages } from "@/modules/survey/editor/lib/workspace";
import { getSurveyFollowUpsPermission } from "@/modules/survey/follow-ups/lib/utils";
import { getActionClasses } from "@/modules/survey/lib/action-class";
import { getExternalUrlsPermission } from "@/modules/survey/lib/permission";
import {
  getFinishedResponseCountBySurveyId,
  getResponseCountBySurveyId,
} from "@/modules/survey/lib/response";
import { getSurvey } from "@/modules/survey/lib/survey";
import { getSurveyAuth } from "@/modules/survey/lib/survey-auth";
import { getWorkspaceWithTeamIds } from "@/modules/survey/lib/workspace";
import { SURVEY_SCHEDULING_CONFIG } from "@/modules/survey/scheduling/lib/constants";
import { getSurveyVisibilityViewer } from "@/modules/survey/visibility/lib/gate";
import { ErrorComponent } from "@/modules/ui/components/error-component";
import { SurveyEditor } from "./components/survey-editor";
import { getUserLocale } from "./lib/user";

// No `generateMetadata` here on purpose: Next only reads metadata from the exports of the route
// segment's own module, and the /edit route file re-exports the default alone
// (app/(app)/(survey-editor)/workspaces/[workspaceId]/surveys/[surveyId]/edit/page.tsx). A
// `generateMetadata` exported from this module would never run, so the editor has no title of its
// own and no survey name to protect. Wiring one up is a UI change, not part of this fix — see
// ENG-2372.

export const SurveyEditorPage = async (props: {
  params: Promise<{ workspaceId: string; surveyId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) => {
  const searchParams = await props.searchParams;
  const params = await props.params;

  // Gated here rather than by a layout: the editor lives in its own route group
  // ((survey-editor)) with its own layout, so it does not inherit the guard on
  // (app)/workspaces/[workspaceId]/surveys/[surveyId]/layout.tsx.
  const { session, isMember, hasReadAccess } = await getSurveyAuth(params.workspaceId, params.surveyId);

  const t = await getTranslate();

  const [survey, workspaceWithTeamIds] = await Promise.all([
    getSurvey(params.surveyId),
    getWorkspaceWithTeamIds(params.workspaceId),
  ]);

  if (!workspaceWithTeamIds) {
    throw new ResourceNotFoundError(t("common.workspace"), null);
  }

  const [actionClasses, responseCount, finishedResponseCount] = await Promise.all([
    getActionClasses(workspaceWithTeamIds.id),
    getResponseCountBySurveyId(params.surveyId),
    getFinishedResponseCountBySurveyId(params.surveyId),
  ]);

  if (!workspaceWithTeamIds) {
    throw new ResourceNotFoundError(t("common.workspace"), null);
  }

  const isSurveyCreationDeletionDisabled = isMember && hasReadAccess;
  const [locale, userEmail] = await Promise.all([
    getUserLocale(session.user.id),
    getUserEmail(session.user.id),
  ]);

  const [isSurveyFollowUpsAllowed, isExternalUrlsAllowed, isCustomCssPlanAllowed] = await Promise.all([
    getSurveyFollowUpsPermission(workspaceWithTeamIds.organizationId),
    getExternalUrlsPermission(workspaceWithTeamIds.organizationId),
    getCustomCssPlanAllowed(),
  ]);
  const [workspaceLanguages, teamMemberDetails] = await Promise.all([
    getWorkspaceLanguages(workspaceWithTeamIds.id),
    getTeamMemberDetails(workspaceWithTeamIds.teamIds),
  ]);

  if (!survey || !actionClasses || !workspaceWithTeamIds || !userEmail || isSurveyCreationDeletionDisabled) {
    return <ErrorComponent />;
  }

  const isCxMode = searchParams.mode === "cx";
  const publicDomain = getPublicDomain();
  const { surveyVisibilityGate, visibility, surveyAccess, ownerName } = await getSurveyVisibilityViewer(
    survey,
    session.user.id,
    workspaceWithTeamIds.organizationId
  );

  // The workspace row reaches the editor without its CSS columns (source, compiled output and the
  // previous revision); the editor gets only what the Custom CSS card shows, read here on the server.
  const customCssEditor = await getSurveyCustomCssEditorConfig({
    storedWorkspaceCustomCss: (await getWorkspaceCustomCssRecord(workspaceWithTeamIds.id)).customCss,
    survey,
    workspaceHeadScripts: workspaceWithTeamIds.customHeadScripts,
    organizationId: workspaceWithTeamIds.organizationId,
    planAllowed: isCustomCssPlanAllowed,
  });

  return (
    <SurveyEditor
      survey={survey}
      workspace={workspaceWithTeamIds}
      actionClasses={actionClasses}
      responseCount={responseCount}
      finishedResponseCount={finishedResponseCount}
      colors={SURVEY_BG_COLORS}
      workspaceLanguages={workspaceLanguages}
      isImageSearchConfigured={!!pramaanConfigured}
      isCxMode={isCxMode}
      surveySchedulingConfig={SURVEY_SCHEDULING_CONFIG}
      locale={locale ?? DEFAULT_LOCALE}
      mailFrom={MAIL_FROM ?? "hola@forms.com"}
      isSurveyFollowUpsAllowed={isSurveyFollowUpsAllowed}
      userEmail={userEmail}
      teamMemberDetails={teamMemberDetails}
      isStorageConfigured={IS_STORAGE_CONFIGURED}
      isExternalUrlsAllowed={isExternalUrlsAllowed}
      publicDomain={publicDomain}
      surveyVisibilityGate={surveyVisibilityGate}
      visibility={visibility}
      surveyAccess={surveyAccess}
      ownerName={ownerName}
      customCssEditor={customCssEditor}
    />
  );
};

/**
 * What the survey's Custom CSS card needs (ENG-3553), mirroring the server's own rules: the inherited
 * workspace CSS as source (read-only) and as delivered compiled output (for the preview), the health
 * of both saved values, the plan gate, and — self-hosted only — whether either set of Custom Head
 * Scripts already adds page styles. Survey edit permission is the editor's own: reaching it is it.
 */
const getSurveyCustomCssEditorConfig = async (params: {
  storedWorkspaceCustomCss: unknown;
  survey: TSurvey;
  workspaceHeadScripts: string | null;
  organizationId: string;
  planAllowed: boolean;
}): Promise<TSurveyCustomCssEditorConfig> => {
  const workspaceCustomCss = parseStoredCustomCss(params.storedWorkspaceCustomCss);
  const [workspaceCompiled, workspaceHealth, surveyHealth] = await Promise.all([
    toDeliveredCustomCss(workspaceCustomCss, "workspace"),
    getCustomCssHealth(workspaceCustomCss, "workspace"),
    getCustomCssHealth(params.survey.customCss, "survey"),
  ]);

  return {
    planAllowed: params.planAllowed,
    billingHref: null,
    hasHeadScriptStyles:
      hasStylesInHeadScripts(params.workspaceHeadScripts) ||
      hasStylesInHeadScripts(params.survey.customHeadScripts),
    surveyStatus: surveyHealth.status,
    workspace: {
      source: getCustomCssSource(workspaceCustomCss),
      compiled: workspaceCompiled ?? null,
      status: workspaceHealth.status,
    },
  };
};
