import { AuthenticationError, ResourceNotFoundError } from "@forms/types/errors";
import { SurveyAnalysisNavigation } from "@/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/components/SurveyAnalysisNavigation";
import { ResponsePage } from "@/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/responses/components/ResponsePage";
import { SurveyAnalysisCTA } from "@/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/components/SurveyAnalysisCTA";
import { getTranslate } from "@/i18n/server";
import { getAISmartToolsUnavailableReason, getOrganizationAIConfig } from "@/lib/ai/service";
import { IS_STORAGE_CONFIGURED, RESPONSES_PER_PAGE } from "@/lib/constants";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { getResponseCountBySurveyId, getResponses } from "@/lib/response/service";
import { getSurvey } from "@/lib/survey/service";
import { getTagsByWorkspaceId } from "@/lib/tag/service";
import { getUser } from "@/lib/user/service";
import { getSurveyAuth } from "@/modules/survey/lib/survey-auth";
import { RestrictedSurveyBanner } from "@/modules/survey/visibility/components/restricted-survey-banner";
import { getSurveyVisibilityViewer } from "@/modules/survey/visibility/lib/gate";
import { showRestrictedBanner } from "@/modules/survey/visibility/lib/markers";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";

const Page = async (props: Readonly<{ params: Promise<{ workspaceId: string; surveyId: string }> }>) => {
  const params = await props.params;
  const t = await getTranslate();

  const { session, organization, isReadOnly, canManage, workspace } = await getSurveyAuth(
    params.workspaceId,
    params.surveyId
  );

  const [survey, user, tags, responseCount] = await Promise.all([
    getSurvey(params.surveyId),
    getUser(session.user.id),
    getTagsByWorkspaceId(workspace.id),
    getResponseCountBySurveyId(params.surveyId),
  ]);

  if (!survey) {
    throw new ResourceNotFoundError(t("common.survey"), params.surveyId);
  }

  if (!user) {
    throw new AuthenticationError(t("common.not_authenticated"));
  }

  if (!organization) {
    throw new ResourceNotFoundError(t("common.organization"), null);
  }

  const publicDomain = getPublicDomain();

  const aiConfig = await getOrganizationAIConfig(organization.id);
  const aiUnavailableReason = getAISmartToolsUnavailableReason(aiConfig) ?? null;

  // Fetch initial responses on the server to prevent duplicate client-side fetch
  const [initialResponses, { surveyVisibilityGate, visibility, surveyAccess, ownerName }] = await Promise.all(
    [
      getResponses(params.surveyId, RESPONSES_PER_PAGE, 0),
      getSurveyVisibilityViewer(survey, session.user.id, organization.id),
    ]
  );

  return (
    <PageContentWrapper>
      <PageHeader
        pageTitle={survey.name}
        cta={
          <SurveyAnalysisCTA
            isReadOnly={isReadOnly}
            canManage={canManage}
            user={user}
            publicDomain={publicDomain}
            responseCount={responseCount}
            isStorageConfigured={IS_STORAGE_CONFIGURED}
            aiUnavailableReason={aiUnavailableReason}
          />
        }>
        <SurveyAnalysisNavigation survey={survey} activeId="responses" />
      </PageHeader>
      {showRestrictedBanner({
        enforced: surveyVisibilityGate.enforced,
        visibility,
        access: surveyAccess,
      }) && <RestrictedSurveyBanner ownerName={ownerName} />}
      <ResponsePage
        survey={survey}
        surveyId={params.surveyId}
        environmentTags={tags}
        user={user}
        responsesPerPage={RESPONSES_PER_PAGE}
        locale={user.locale}
        isReadOnly={isReadOnly}
        initialResponses={initialResponses}
      />
    </PageContentWrapper>
  );
};

export default Page;
