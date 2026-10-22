"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { OperationNotAllowedError } from "@forms/types/errors";
import { assertCan } from "@/lib/authorization";
import { isWorkspaceDefaultSurveyLanguage } from "@/lib/i18n/default-survey-language";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getWorkspace } from "@/lib/workspace/service";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { getTeamsByOrganizationId } from "@/modules/organization/settings/teams/lib/team";
import { updateWorkspace } from "@/modules/workspaces/settings/lib/workspace";
import { ZWorkspaceUpdateActionInput } from "@/modules/workspaces/settings/lib/workspace-update-input";

const ZUpdateWorkspaceAction = z.object({
  workspaceId: ZId,
  data: ZWorkspaceUpdateActionInput,
});

export const updateWorkspaceAction = authenticatedActionClient
  .inputSchema(ZUpdateWorkspaceAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.manage", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, parsedInput.workspaceId);

    const oldObject = await getWorkspace(parsedInput.workspaceId);

    // The default survey language has to be one of the workspace's own survey languages, so the setting
    // can never name a language the workspace does not have (ENG-2816). The input schema already limits
    // it to the languages the survey runtime ships strings for; this is the half that needs the
    // workspace, and it pairs with `deleteLanguage` refusing to remove the language it points at.
    const nextDefaultSurveyLanguage = parsedInput.data.config?.defaultSurveyLanguage;
    if (
      nextDefaultSurveyLanguage &&
      !oldObject?.languages.some((language) =>
        isWorkspaceDefaultSurveyLanguage(language.code, nextDefaultSurveyLanguage)
      )
    ) {
      throw new OperationNotAllowedError(
        "The default survey language must be one of the workspace's survey languages"
      );
    }

    // `config` is a JSON column, which Prisma replaces wholesale rather than merging. Merging the
    // caller's keys onto what is stored *now* means a partial write only touches the keys it names: a
    // settings page that has been open a while can no longer revert a key some other surface has
    // written since it rendered. Callers send the fields they are changing, not a whole config.
    const data = parsedInput.data.config
      ? { ...parsedInput.data, config: { ...oldObject?.config, ...parsedInput.data.config } }
      : parsedInput.data;

    const result = await updateWorkspace(parsedInput.workspaceId, data);

    if (oldObject?.linkSurveyBranding === true && parsedInput.data.linkSurveyBranding === false) {
    }

    if (oldObject?.inAppSurveyBranding === true && parsedInput.data.inAppSurveyBranding === false) {
    }

    return result;
  });

const ZGetTeamsByOrganizationIdAction = z.object({
  organizationId: ZId,
});

export const getTeamsByOrganizationIdAction = authenticatedActionClient
  .inputSchema(ZGetTeamsByOrganizationIdAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "organization.manage", {
      type: "organization",
      id: parsedInput.organizationId,
    });
    const teams = await getTeamsByOrganizationId(parsedInput.organizationId);
    return teams;
  });
