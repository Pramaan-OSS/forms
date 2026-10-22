import "server-only";
import { toOutcomeRun } from "@forms/pramaan";
import { z } from "zod";
import { pramaan } from "@/lib/pramaan";

export const localizationResult = z.object({
  translations: z.array(
    z.object({ language: z.string(), text: z.string().optional(), notes: z.string().optional() })
  ),
});
export class LocalizationUncertain extends Error {}
export async function localizeSurveyText(text: string, languages: string[], signal?: AbortSignal) {
  if (!pramaan) throw new Error("This feature is not available yet.");
  if (languages.length === 1) {
    const result = z
      .object({ text: z.string() })
      .parse(await pramaan.call("text.translate", { text, targetLanguage: languages[0] }));
    return { translations: [{ language: languages[0], text: result.text }] };
  }
  const started = await pramaan.outcomes.start(
    "content.localize",
    { text, languages },
    { options: { review: true }, signal }
  );
  let report;
  if ("id" in started) {
    try {
      const job = await pramaan.jobs.wait(started.id, { timeoutMs: 90000, signal });
      if (job.status === "cancelled") throw new Error("Translation cancelled.");
      if (job.status !== "done" || job.result === undefined)
        throw new LocalizationUncertain("Check the translation status before trying again.");
      report = toOutcomeRun(job.result);
    } catch (error) {
      try {
        await pramaan.jobs.cancel(started.id);
      } catch {
        throw new LocalizationUncertain(
          "Could not confirm cancellation. Check the translation status before trying again."
        );
      }
      throw error;
    }
  } else report = started;
  if (report.steps.some((step) => step.effect === "unknown"))
    throw new LocalizationUncertain("Check the translation status before trying again.");
  if (report.status !== "done") throw new Error("Translation did not finish.");
  return localizationResult.parse(report.result);
}
