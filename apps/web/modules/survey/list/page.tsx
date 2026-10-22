import { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResourceNotFoundError } from "@forms/types/errors";
import { getTranslate } from "@/i18n/server";
import { DEFAULT_LOCALE, SURVEYS_PER_PAGE } from "@/lib/constants";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { resolveDefaultSurveyLanguage } from "@/lib/i18n/default-survey-language";
import { getBillingFallbackPath } from "@/lib/membership/navigation";
import { getUserLocale } from "@/lib/user/service";
import { getSurveyAIAvailability } from "@/modules/survey/lib/get-survey-ai-availability";
import { getWorkspaceWithTeamIds } from "@/modules/survey/lib/workspace";
import { SurveysList } from "@/modules/survey/list/components/survey-list";
import { getSurveyVisibilityUiGate } from "@/modules/survey/visibility/lib/gate";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const metadata: Metadata = {
  title: "Your Surveys",
};

interface SurveyTemplateProps {
  params: Promise<{
    workspaceId: string;
  }>;
}

export const SurveysPage = async ({ params: paramsProps }: SurveyTemplateProps) => {
  const publicDomain = getPublicDomain();
  const params = await paramsProps;
  const t = await getTranslate();

  const workspace = await getWorkspaceWithTeamIds(params.workspaceId);

  if (!workspace) {
    throw new ResourceNotFoundError(t("common.workspace"), null);
  }

  const { session, isBilling, isReadOnly } = await getWorkspaceAuth(params.workspaceId);

  if (isBilling) {
    return redirect(getBillingFallbackPath(workspace.organizationId));
  }

  const currentWorkspaceChannel = workspace.config.channel ?? null;
  const [locale, { isAIAvailable, aiUnavailableReason }, surveyVisibilityGate] = await Promise.all([
    getUserLocale(session.user.id).then((l) => l ?? DEFAULT_LOCALE),
    getSurveyAIAvailability(workspace.organizationId, { isReadOnly }),
    getSurveyVisibilityUiGate(workspace.organizationId),
  ]);
  const workspaceWithRequiredProps = {
    ...workspace,
    brandColor: workspace.styling?.brandColor?.light ?? null,
    highlightBorderColor: null,
  };

  return (
    <SurveysList
      workspace={workspaceWithRequiredProps}
      isReadOnly={isReadOnly}
      publicDomain={publicDomain}
      surveysPerPage={SURVEYS_PER_PAGE}
      currentWorkspaceChannel={currentWorkspaceChannel}
      locale={locale}
      defaultSurveyLanguage={resolveDefaultSurveyLanguage({
        workspaceDefaultLanguage: workspace.config.defaultSurveyLanguage,
        userLocale: locale,
      })}
      isAIAvailable={isAIAvailable}
      aiUnavailableReason={aiUnavailableReason}
      showFeaturedTemplates
      surveyVisibilityGate={surveyVisibilityGate}
      currentUserId={session.user.id}
    />
  );
};
