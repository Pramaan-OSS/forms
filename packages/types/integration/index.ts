import { z } from "zod";
import { type TIntegrationAirtable, ZIntegrationAirtableConfig, ZIntegrationAirtableInput } from "./airtable";
import {
  type TIntegrationGoogleSheets,
  ZIntegrationGoogleSheetsConfig,
  ZIntegrationGoogleSheetsInput,
} from "./google-sheet";
import { type TIntegrationNotion, ZIntegrationNotionConfig, ZIntegrationNotionInput } from "./notion";
import { type TIntegrationSlack, ZIntegrationSlackConfig, ZIntegrationSlackInput } from "./slack";

export const ZIntegrationType = z.enum(["googleSheets", "n8n", "airtable", "notion", "slack"]);
export type TIntegrationType = z.infer<typeof ZIntegrationType>;

export const ZConnectedAppConfig = z.object({
  connectedApp: z.literal(true),
  userId: z.string(),
  app: z.enum(["googlesheets", "airtable", "notion", "slack"]),
  data: z.array(
    z.object({
      createdAt: z.coerce.date(),
      surveyId: z.string(),
      action: z.string(),
      query: z.string(),
      input: z.record(z.string(), z.unknown()),
    })
  ),
});
export type TConnectedAppConfig = z.infer<typeof ZConnectedAppConfig>;

export const ZIntegrationConfig = z.union([
  ZConnectedAppConfig,
  ZIntegrationGoogleSheetsConfig,
  ZIntegrationAirtableConfig,
  ZIntegrationNotionConfig,
  ZIntegrationSlackConfig,
]);

export type TIntegrationConfig = z.infer<typeof ZIntegrationConfig>;

export const ZIntegrationBase = z.object({
  id: z.string(),
  workspaceId: z.cuid2(),
});

export const ZIntegration = ZIntegrationBase.extend({
  type: ZIntegrationType,
  config: ZIntegrationConfig,
});

export type TIntegration = z.infer<typeof ZIntegration>;

export type TIntegrationByType<T extends TIntegrationType> = T extends "airtable"
  ? TIntegrationAirtable
  : T extends "googleSheets"
    ? TIntegrationGoogleSheets
    : T extends "notion"
      ? TIntegrationNotion
      : T extends "slack"
        ? TIntegrationSlack
        : TIntegration;

export const ZIntegrationBaseSurveyData = z.object({
  createdAt: z.date(),
  elementIds: z.array(z.string()),
  elements: z.string(),
  surveyId: z.string(),
  surveyName: z.string(),
});

export const ZIntegrationInput = z.discriminatedUnion("type", [
  ZIntegrationGoogleSheetsInput,
  ZIntegrationAirtableInput,
  ZIntegrationNotionInput,
  ZIntegrationSlackInput,
]);
export type TIntegrationInput = z.infer<typeof ZIntegrationInput>;

export const ZIntegrationItem = z.object({
  name: z.string(),
  id: z.string(),
});
export type TIntegrationItem = z.infer<typeof ZIntegrationItem>;
