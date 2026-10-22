import { TResponsePipelineJobData } from "@forms/jobs";
import { logger } from "@forms/logger";
import { TIntegration, ZConnectedAppConfig } from "@forms/types/integration";
import {
  executeAppAction,
  searchConnectedAppActions,
  validateActionInput,
} from "@/modules/connected-apps/lib/connected-apps";
import { mapResponseInput } from "@/modules/connected-apps/lib/response-input";

export const handleIntegrations = async (
  integrations: TIntegration[],
  data: Pick<TResponsePipelineJobData, "surveyId" | "response">,
  survey: { name: string },
  _displayTimeZone = "UTC"
): Promise<void> => {
  for (const integration of integrations) {
    const parsed = ZConnectedAppConfig.safeParse(integration.config);
    if (!parsed.success) continue; // Legacy credentials never run; reconnect through settings.
    const config = parsed.data;
    for (const mapping of config.data.filter((item) => item.surveyId === data.surveyId)) {
      try {
        const actions = await searchConnectedAppActions(mapping.query, config.app);
        if (!actions.some((item) => item.app === config.app && item.action === mapping.action)) {
          logger.warn("Connected action is not available yet; update the response mapping.");
          continue;
        }
        const input = mapResponseInput(mapping.input, data.response, survey.name);
        const action = actions.find((item) => item.app === config.app && item.action === mapping.action);
        if (!validateActionInput(action?.inputSchema, input)) {
          logger.warn(
            "Connected action input no longer matches its required fields; update the response mapping."
          );
          continue;
        }
        const result = await executeAppAction(
          config.userId,
          mapping.action,
          input,
          `response-${data.response.id}-${integration.id}-${mapping.surveyId}`
        );
        if (result.status !== "succeeded")
          logger.warn("Could not confirm the connected action. Check before retrying.");
      } catch {
        logger.warn("Could not confirm the connected action. Check before retrying.");
      }
    }
  }
};
