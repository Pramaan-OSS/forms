import * as yaml from "yaml";
import { createDocument } from "zod-openapi";
import { ZApiKeyData } from "@forms/database/zod/api-keys";
import { ZContact } from "@forms/database/zod/contact";
import { ZContactAttributeKey } from "@forms/database/zod/contact-attribute-keys";
import { ZContactAttribute } from "@forms/database/zod/contact-attributes";
import { ZResponse } from "@forms/database/zod/responses";
import { ZRoles } from "@forms/database/zod/roles";
import { ZSurveyWithoutQuestionType } from "@forms/database/zod/surveys";
import { ZTeam } from "@forms/database/zod/teams";
import { ZUser } from "@forms/database/zod/users";
import { ZWebhook, ZWebhookWithoutSecret } from "@forms/database/zod/webhooks";
import { ZWorkspaceTeam } from "@forms/database/zod/workspace-teams";
import { healthPaths } from "@/modules/api/v2/health/lib/openapi";
import { ZOverallHealthStatus } from "@/modules/api/v2/health/types/health-status";
import { responsePaths } from "@/modules/api/v2/management/responses/lib/openapi";
import { surveyPaths } from "@/modules/api/v2/management/surveys/lib/openapi";
import { webhookPaths } from "@/modules/api/v2/management/webhooks/lib/openapi";
import { mePaths } from "@/modules/api/v2/me/lib/openapi";
import { rolePaths } from "@/modules/api/v2/roles/lib/openapi";

const document = createDocument({
  openapi: "3.1.0",
  info: {
    title: "Forms API",
    description: "Manage Forms resources programmatically.",
    version: "2.0.0",
  },
  paths: {
    ...healthPaths,
    ...rolePaths,
    ...mePaths,
    ...responsePaths,
    ...surveyPaths,
    ...webhookPaths,
  },
  servers: [
    {
      url: "/",
      description: "Forms Cloud",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "Operations for checking critical application dependencies health status.",
    },
    {
      name: "Roles",
      description: "Operations for managing roles.",
    },
    {
      name: "Me",
      description: "Operations for managing your API key.",
    },
    {
      name: "Management API - Responses",
      description: "Operations for managing responses.",
    },
    {
      name: "Management API - Surveys",
      description: "Operations for managing surveys.",
    },
    {
      name: "Management API - Webhooks",
      description: "Operations for managing webhooks.",
    },
  ],
  components: {
    securitySchemes: {
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Use your Forms x-api-key to authenticate.",
      },
    },
    schemas: {
      health: ZOverallHealthStatus,
      role: ZRoles,
      me: ZApiKeyData,
      response: ZResponse,
      contact: ZContact,
      contactAttribute: ZContactAttribute,
      contactAttributeKey: ZContactAttributeKey,
      survey: ZSurveyWithoutQuestionType,
      webhook: ZWebhook,
      webhookWithoutSecret: ZWebhookWithoutSecret,
      team: ZTeam,
      workspaceTeam: ZWorkspaceTeam,
      user: ZUser,
    },
  },
  security: [
    {
      apiKeyAuth: [],
    },
  ],
});

// do not replace this with logger.info
console.log(yaml.stringify(document));
