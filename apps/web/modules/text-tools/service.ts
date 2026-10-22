import "server-only";
import { z } from "zod";
import { prisma } from "@forms/database";
import { TSurveyElementTypeEnum } from "@forms/types/surveys/constants";
import { TSurvey } from "@forms/types/surveys/types";
import { ZWorkspaceTextTools } from "@forms/types/workspace";
import { pramaan } from "@/lib/pramaan";
import { getElementsFromBlocks } from "@/lib/survey/utils";

export const analysisSchema = z.record(
  z.string(),
  z.object({
    sentiment: z.string().optional(),
    language: z.string().optional(),
    confidence: z.number().optional(),
  })
);
export async function textToolSettings(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { config: true },
  });
  return ZWorkspaceTextTools.parse(workspace?.config.textTools ?? {});
}
export async function analyzeResponse(
  workspaceId: string,
  response: { id: string; data: Record<string, unknown> },
  survey: Pick<TSurvey, "blocks">
) {
  const settings = await textToolSettings(workspaceId);
  if (!settings.enabled || !pramaan) return;
  const existing = await prisma.responseTextAnalysis.findUnique({ where: { responseId: response.id } });
  if (existing) return;
  const analysis: z.infer<typeof analysisSchema> = {};
  const elements = getElementsFromBlocks(survey.blocks).filter(
    (item) => item.type === TSurveyElementTypeEnum.OpenText
  );
  let unavailable = false;
  for (const element of elements) {
    const value = response.data[element.id];
    if (typeof value !== "string" || !value.trim()) continue;
    if (value.length > 20000) continue;
    const [sentiment, language] = await Promise.allSettled([
      pramaan.call("text.sentiment.analyze", { text: value }),
      pramaan.call("text.language.detect", { text: value.slice(0, 5000) }),
    ]);
    const tone = z
      .object({ sentiment: z.string().optional(), confidence: z.number().optional() })
      .refine((value) => value.sentiment !== undefined || value.confidence !== undefined)
      .safeParse(sentiment.status === "fulfilled" ? sentiment.value : undefined);
    const lang = z
      .object({ language: z.string() })
      .safeParse(language.status === "fulfilled" ? language.value : undefined);
    if (!tone.success && !lang.success) {
      unavailable = true;
      continue;
    }
    analysis[element.id] = {
      ...(tone.success ? tone.data : {}),
      ...(lang.success ? { language: lang.data.language } : {}),
    };
  }
  if (unavailable && Object.keys(analysis).length === 0)
    throw new Error("Text analysis is not available yet.");
  await prisma.responseTextAnalysis.upsert({
    where: { responseId: response.id },
    create: { responseId: response.id, data: analysis },
    update: { data: analysis },
  });
}
export async function translateAnswer(text: string, workspaceId: string) {
  const settings = await textToolSettings(workspaceId);
  if (!settings.enabled || !pramaan) throw new Error("This feature is not available yet.");
  if (!text.trim() || text.length > 5000) throw new Error("This answer is too long to translate.");
  return z
    .object({ text: z.string() })
    .parse(await pramaan.call("text.translate", { text, targetLanguage: settings.language })).text;
}
