import { z } from "zod";
import { prisma } from "@forms/database";
import { ZConnectedAppConfig } from "@forms/types/integration";
import { withV3ApiWrapper } from "@/app/api/v3/lib/api-wrapper";
import { requireSessionWorkspaceAccess } from "@/app/api/v3/lib/auth";
import { assertNewlyAttachedSurveysWorkspaceVisible } from "@/lib/survey/visibility/outbound";
import { listAppConnections, searchConnectedAppActions } from "@/modules/connected-apps/lib/connected-apps";

const params = z.object({
  workspaceId: z.cuid2(),
  app: z.enum(["googlesheets", "airtable", "notion", "slack"]),
});
const types = {
  googlesheets: "googleSheets",
  airtable: "airtable",
  notion: "notion",
  slack: "slack",
} as const;
export const GET = withV3ApiWrapper({
  auth: "session",
  schemas: { params, query: z.object({ query: z.string().min(1).max(200) }) },
  handler: async ({ parsedInput, authentication, requestId, instance }) => {
    const access = await requireSessionWorkspaceAccess(
      authentication,
      parsedInput.params.workspaceId,
      "manage",
      requestId,
      instance
    );
    if (access instanceof Response) return access;
    try {
      const entries = await searchConnectedAppActions(parsedInput.query.query, parsedInput.params.app);
      return Response.json({ data: entries.filter((item) => item.app === parsedInput.params.app) });
    } catch {
      return Response.json({ error: "This feature is not available yet." }, { status: 503 });
    }
  },
});
export const PUT = withV3ApiWrapper({
  auth: "session",
  schemas: {
    params,
    query: z.object({}),
    body: z.object({
      query: z.string().min(1).max(200),
      action: z.string().min(1).max(200),
      surveyId: z.cuid2(),
      input: z.record(z.string(), z.unknown()),
    }),
  },
  handler: async ({ parsedInput, authentication, requestId, instance }) => {
    const { workspaceId, app } = parsedInput.params;
    const access = await requireSessionWorkspaceAccess(
      authentication,
      workspaceId,
      "manage",
      requestId,
      instance
    );
    if (access instanceof Response) return access;
    if (!authentication || !("user" in authentication))
      return Response.json({ error: "Sign in first." }, { status: 401 });
    const { surveyId, action, query, input } = parsedInput.body;
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, workspaceId },
      select: { id: true },
    });
    if (!survey) return Response.json({ error: "Survey not found." }, { status: 404 });
    await assertNewlyAttachedSurveysWorkspaceVisible([surveyId], []);
    try {
      const entries = await searchConnectedAppActions(query, app);
      if (!entries.some((item) => item.app === app && item.action === action && item.inputSchema))
        return Response.json({ error: "Choose an available action." }, { status: 400 });
      const connections = await listAppConnections(authentication.user.id, app);
      if (!connections.some((item) => item.status === "active"))
        return Response.json({ error: "Connect your account first." }, { status: 409 });
      const type = types[app];
      const existing = await prisma.integration.findUnique({
        where: { type_workspaceId: { type, workspaceId } },
      });
      const previous = ZConnectedAppConfig.safeParse(existing?.config);
      if (previous.success && previous.data.userId !== authentication.user.id) {
        return Response.json(
          { error: "Remove the previous response mappings before connecting a different account." },
          { status: 409 }
        );
      }
      const config = ZConnectedAppConfig.parse({
        connectedApp: true,
        userId: authentication.user.id,
        app,
        data: [
          ...(previous.success ? previous.data.data.filter((item) => item.surveyId !== surveyId) : []),
          { surveyId, createdAt: new Date(), action, query, input },
        ],
      });
      await prisma.integration.upsert({
        where: { type_workspaceId: { type, workspaceId } },
        create: { workspaceId, type, config },
        update: { config },
      });
      return Response.json({ data: { saved: true } });
    } catch {
      return Response.json({ error: "This feature is not available yet." }, { status: 503 });
    }
  },
});

export const DELETE = withV3ApiWrapper({
  auth: "session",
  schemas: { params, query: z.object({}) },
  handler: async ({ parsedInput, authentication, requestId, instance }) => {
    const { workspaceId, app } = parsedInput.params;
    const access = await requireSessionWorkspaceAccess(
      authentication,
      workspaceId,
      "manage",
      requestId,
      instance
    );
    if (access instanceof Response) return access;
    await prisma.integration.deleteMany({ where: { workspaceId, type: types[app] } });
    return Response.json({ data: { removed: true } });
  },
});
