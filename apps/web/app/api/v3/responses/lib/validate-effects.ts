import "server-only";
import type { TResponseData, TResponseDataValue, TResponseMeta, TResponseTtc } from "@forms/types/responses";
import type { TV3ResponseRow } from "./service";
import type { TV3WriteSurveyRow } from "./write-service";

/**
 * What a successful write would do, reported without doing it — `ResponseValidationEffects` in the
 * contract.
 *
 * Every field here is derived from the same inputs the write itself uses, never re-decided. Where
 * that is not possible the field says so rather than guessing: see `firesPipeline` on a patch.
 */
export type TV3ResponseValidationEffects = {
  language: string | null;
  contactId: string | null;
  displayId: string | null;
  firesPipeline: boolean;
  countsTowardMeteredResponses: boolean;
  tagsToApply?: string[];
};

export async function createEffects({
  language,
  contactId,
  displayId,
}: {
  survey: TV3WriteSurveyRow;
  organizationId: string;
  requestId: string;
  finished: boolean;
  language: string | null;
  data: TResponseData;
  variables: Record<string, TResponseDataValue>;
  ttc: TResponseTtc;
  meta: TResponseMeta;
  contactId?: string;
  displayId?: string;
}): Promise<TV3ResponseValidationEffects> {
  // The plan-free product meters nothing, so the effect is a constant and no read backs it.
  return {
    language,
    contactId: contactId ?? null,
    displayId: displayId ?? null,
    // A create always dispatches `responseCreated`.
    firesPipeline: true,
    countsTowardMeteredResponses: false,
  };
}

export async function patchEffects({
  stored,
  language,
  tagsToApply,
}: {
  survey: TV3WriteSurveyRow;
  stored: TV3ResponseRow;
  requestId: string;
  finished: boolean;
  language: string | null;
  data: TResponseData;
  variables: Record<string, TResponseDataValue>;
  ttc: TResponseTtc;
  tagsToApply: string[];
}): Promise<TV3ResponseValidationEffects> {
  return {
    language,
    contactId: stored.contact?.id ?? null,
    displayId: stored.displayId,
    /*
     * Always true for a patch. This used to report `finished && !stored.finished`, which modelled
     * only `responseFinished` — but `updateV3Response` dispatches `responseUpdated` on *every* patch,
     * and the pipeline job fans any event out to its webhooks. A caller that dry-ran a correction,
     * read `false`, and concluded nothing would fire would then watch its `responseUpdated` webhooks
     * run.
     *
     * The field answers "would a real write run the pipeline", so the transition only decides which
     * events go out, not whether any do. `responseFinished` additionally fires on the transition.
     */
    firesPipeline: true,
    // Metering is a `responseCreated` side effect; a patch never meters.
    countsTowardMeteredResponses: false,
    tagsToApply,
  };
}
