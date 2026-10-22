import { z } from "zod";
import { prisma } from "@forms/database";
import { withV3ApiWrapper } from "@/app/api/v3/lib/api-wrapper";
import { getV3Response } from "@/app/api/v3/responses/lib/operations";
import { isSurveyOutboundAllowed } from "@/lib/survey/visibility/outbound";
import { textToolSettings, translateAnswer } from "@/modules/text-tools/service";

const params = z.object({ responseId: z.cuid2() });
export const GET = withV3ApiWrapper({
  auth: "session",
  schemas: { params, query: z.object({}) },
  handler: async (ctx) => {
    const { responseId } = ctx.parsedInput.params;
    const access = await getV3Response({ ...ctx, responseId });
    if (!access.ok) return access;
    const row = await prisma.response.findUniqueOrThrow({
      where: { id: responseId },
      select: { survey: { select: { workspaceId: true } }, textAnalysis: true },
    });
    const settings = await textToolSettings(row.survey.workspaceId);
    return Response.json({
      data: { enabled: settings.enabled, analysis: settings.enabled ? (row.textAnalysis?.data ?? {}) : {} },
    });
  },
});
export const POST = withV3ApiWrapper({
  auth: "session",
  schemas: { params, query: z.object({}), body: z.object({ elementId: z.string() }) },
  handler: async (ctx) => {
    const { responseId } = ctx.parsedInput.params;
    const access = await getV3Response({ ...ctx, responseId });
    if (!access.ok) return access;
    const row = await prisma.response.findUniqueOrThrow({
      where: { id: responseId },
      include: { survey: true },
    });
    if (!isSurveyOutboundAllowed(row.survey))
      return Response.json(
        { error: "This survey cannot send answers outside the workspace." },
        { status: 403 }
      );
    const value = row.data[ctx.parsedInput.body.elementId];
    if (typeof value !== "string") return Response.json({ error: "Choose a text answer." }, { status: 400 });
    try {
      return Response.json({ data: { text: await translateAnswer(value, row.survey.workspaceId) } });
    } catch {
      return Response.json({ error: "This feature is not available yet." }, { status: 503 });
    }
  },
});
