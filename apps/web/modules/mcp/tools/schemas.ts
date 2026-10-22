import { z } from "zod";
import { ZId } from "@forms/types/common";
import { ZCustomCssScope } from "@forms/types/custom-css";
import { TSurveyElementTypeEnum } from "@forms/types/surveys/constants";
import { ZSurveyRatingElement } from "@forms/types/surveys/elements";
import { ZSurveyFilters, ZSurveyStatus, ZSurveyType } from "@forms/types/surveys/types";
import { lengthBoundedArray } from "@/app/api/v3/lib/bounded-array";
import {
  V3_SURVEY_MAX_BLOCKS,
  V3_SURVEY_MAX_ENDINGS,
  V3_SURVEY_MAX_LANGUAGES,
  V3_SURVEY_MAX_VARIABLES,
  ZV3EditSurveyBlocksBody,
  ZV3SetSurveyBlockOrderBody,
  ZV3SurveyCustomCss,
} from "@/app/api/v3/surveys/schemas";
import { ZV3WorkspaceCustomCssPatchBody } from "@/app/api/v3/workspaces/lib/custom-css-schemas";

/**
 * Every array argument is declared through `lengthBoundedArray`, never a bare `z.array().max()`: the
 * SDK validates arguments with Zod's `~standard.validate`, which parses every element before an
 * array-level `.max()` runs and collects one issue per element — ahead of the scope gate, so a
 * read-only token can trigger it (ENG-3384). The route-level array budget in `app/api/mcp/route.ts` is
 * the backstop; these bounds are the ones the tool schemas advertise to the model as `maxItems`.
 */
const MCP_MAX_FILTER_VALUES = 10;
const MCP_MAX_LANGUAGE_CODES = 20;

/**
 * Every schema here is `.strict()`, so an argument a tool does not declare is a loud error instead of a
 * silently discarded one (ENG-2256).
 *
 * This has teeth only since the SDK v2 migration. v1 was handed a raw `.shape` and rebuilt it via
 * `objectFromShape()`, which dropped any unknown-keys policy — so `.strict()` here would have been
 * decorative and a misspelled argument was stripped before our code ran. On a *filter* that failed in
 * the dangerous direction: `count_feedback_records` with the pre-#8650 spelling `userId` returned the
 * count for every record in the dataset rather than that user's, and reported success, so the agent had
 * no signal it had been handed the wrong number. v2 validates the schema instance itself, so strictness
 * is now enforced where it is declared.
 *
 * The cost, accepted deliberately: `additionalProperties: false` is advertised on every tool, so a
 * client that adds its own keys to `arguments` is rejected rather than tolerated.
 *
 * **Structured sub-objects are strict too, not just the outer one.** `.strict()` binds a single object,
 * so `filter` and its `name`/`status`/`type` children each need it as well — otherwise the same bug
 * reopens one level down, and worse, quietly: a misspelled `filter.status.include` is dropped, leaves
 * `filter.status` as `{}`, and the query runs unfiltered while reporting success. Raised in review on
 * #8859 after the first version of this change only did the outer objects.
 *
 * What still accepts an arbitrary nested shape, deliberately: the free-form `z.record` fields (`blocks`,
 * `metadata`, `welcomeCard`, and the `data` payloads), which the v3 survey document contract validates
 * once the call reaches the operation.
 *
 * What still accepts one *undeliberately*: everything below `definition` on the two workflow tools. That
 * subtree is `ZWorkflowDefinition` from `packages/workflows`, shared with the v3 Workflows REST route and
 * the builder, so it is not this layer's to tighten — see the note in `./workflow-schemas.ts` (ENG-2437).
 * It is the one remaining hole, and `./schemas.test.ts` holds it there: every other structured object in
 * every MCP tool schema, at any depth, must be strict or the suite fails.
 *
 * Adding a schema? Add `.strict()` with it — and to every structured object nested inside it. Prefer
 * `z.strictObject({...})` for the nested ones: `.strict()` returns a clone that drops `.describe()`, so
 * appending it after a `.describe()` silently deletes the description the model reads.
 *
 * And do not turn on the analytics SDK's `context` injection (it stays off): it
 * injects a `context` argument into every tool's advertised schema, which these schemas would reject.
 */

export const ZMcpListSurveysInput = z
  .object({
    workspaceId: ZId.describe("Workspace ID whose surveys should be listed."),
    // Deliberately capped below the HTTP API's 250: for an agent client the binding constraint is
    // context window, not server cost, so a larger page is a cost rather than a convenience.
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe("Maximum number of surveys to return. Defaults to 20.")
      .default(20),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe("Opaque pagination cursor from a previous list_surveys response."),
    includeTotalCount: z
      .boolean()
      .describe(
        "Whether to include the total matching survey count in the response metadata. Defaults to true."
      )
      .default(true),
    filter: z
      .object({
        name: z
          .strictObject({
            contains: z.string().max(512).optional().describe("Case-insensitive survey name substring."),
          })
          .describe("Filter by survey name.")
          .optional(),
        status: z
          .strictObject({
            in: lengthBoundedArray(ZSurveyStatus, {
              max: MCP_MAX_FILTER_VALUES,
              description: "Survey statuses to include, for example draft or inProgress.",
            }).optional(),
          })
          .describe("Filter by survey status.")
          .optional(),
        type: z
          .strictObject({
            in: lengthBoundedArray(ZSurveyType, {
              max: MCP_MAX_FILTER_VALUES,
              description: "Survey types to include, for example link.",
            }).optional(),
          })
          .describe("Filter by survey type.")
          .optional(),
      })
      .strict()
      .describe("Optional supported v3 survey filters.")
      .optional(),
    sortBy: ZSurveyFilters.shape.sortBy
      .optional()
      .describe("Sort field for pagination. Defaults to the v3 API default of updatedAt."),
  })
  .strict();

export const ZMcpGetSurveyInput = z
  .object({
    surveyId: z.cuid2().describe("Survey ID to fetch."),
    lang: lengthBoundedArray(z.string().trim().min(1), {
      max: MCP_MAX_LANGUAGE_CODES,
      description: "Optional language codes or configured aliases used to filter translatable survey fields.",
    }).optional(),
  })
  .strict();

const ZMcpSurveyLanguageInput = z.strictObject({
  code: z.string().trim().min(1).describe("Language code or configured language alias."),
  default: z.boolean().optional().describe("Whether this language is the default language."),
  enabled: z.boolean().optional().describe("Whether this language is enabled."),
});

const ZMcpObjectInput = z.record(z.string(), z.unknown());

/**
 * The block and element shape, spelled out on the tool surface (ENG-2180).
 *
 * `blocks` is the one field a survey cannot omit, and it was advertised as a free-form object pointing
 * at a "v3 survey document contract" that no tool description defined. The only way to learn the
 * element types was to probe the live validator — and probing undercounts silently: one agent doing
 * exactly that reported 16 of the 17 types and had no way to know it had missed one.
 *
 * The list is derived from the enum the request is actually validated against, never restated, so the
 * advertised vocabulary cannot drift from the accepted one. `SURVEY_BLOCK_EXAMPLE` is asserted against
 * the real create schema in `schemas.test.ts` for the same reason — a worked example that stops
 * validating is worse than none.
 */
const SURVEY_ELEMENT_TYPES = Object.values(TSurveyElementTypeEnum).join(", ");

/** A complete, valid block. Kept minimal: every field here is one the schema requires. */
export const SURVEY_BLOCK_EXAMPLE = {
  name: "Feedback",
  elements: [
    {
      id: "improve",
      type: "openText",
      headline: { "en-US": "What should we improve?" },
      required: false,
    },
  ],
};

/**
 * A `rating`'s two extra fields, read off the element schema rather than restated.
 *
 * Restating them would reintroduce the drift this whole description exists to avoid, and would already
 * be wrong: `ZSurveyRatingElement.range` admits `6`, which the base element's optional `range` and
 * every prose description of it omit. Deriving keeps the advertised values equal to the accepted ones
 * by construction, the same rule `SURVEY_ELEMENT_TYPES` follows.
 */
const RATING_SCALES = (ZSurveyRatingElement.shape.scale as unknown as { options: string[] }).options;
const RATING_RANGES = (
  ZSurveyRatingElement.shape.range as unknown as { options: { value: number }[] }
).options.map((option) => option.value);

const SURVEY_BLOCKS_DESCRIPTION = [
  "Survey blocks. A block is `{ name, elements[], id? }` and an element is `{ id, type, headline, ... }`,",
  `where \`type\` is one of: ${SURVEY_ELEMENT_TYPES}.`,
  "Element ids are caller-supplied and become immutable once the survey leaves draft; block ids are",
  'generated when omitted. Translatable fields are keyed by locale code — `{ "en-US": "..." }` — and',
  "must carry every configured language; the internal `default` key is rejected. Each element type adds",
  `its own required fields — a \`rating\` needs \`scale\` (${RATING_SCALES.join("|")}) and \`range\``,
  `(${RATING_RANGES.join("|")}), a \`pictureSelection\` needs two or more choices. An element that is`,
  "missing one is reported by its position, not by the field name, so add the type's own fields before",
  `retrying. Example block: ${JSON.stringify(SURVEY_BLOCK_EXAMPLE)}`,
].join(" ");

export const ZMcpCreateSurveyInput = z
  .object({
    workspaceId: ZId.describe("Workspace ID where the survey should be created."),
    name: z.string().trim().min(1).describe("Survey name."),
    type: z.literal("link").optional().describe("Survey type. Only link surveys are supported."),
    status: ZSurveyStatus.optional().describe("Initial survey status. Defaults to draft."),
    defaultLanguage: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Default language code or configured language alias. Defaults to en-US."),
    metadata: ZMcpObjectInput.optional().describe("Survey metadata using the v3 survey document contract."),
    languages: lengthBoundedArray(ZMcpSurveyLanguageInput, {
      max: V3_SURVEY_MAX_LANGUAGES,
      description: "Configured survey languages using the v3 survey document contract.",
    }).optional(),
    showLanguageSwitch: z
      .boolean()
      .nullable()
      .optional()
      .describe("Show respondents a language switch on multi-language surveys. null or omitted means off."),
    autoSelectLanguage: z
      .boolean()
      .nullable()
      .optional()
      .describe(
        "Open the survey in the respondent's browser language when it matches an enabled survey language. null or omitted means off."
      ),
    welcomeCard: ZMcpObjectInput.optional().describe("Welcome card using the v3 survey document contract."),
    blocks: lengthBoundedArray(ZMcpObjectInput, {
      min: 1,
      max: V3_SURVEY_MAX_BLOCKS,
      description: SURVEY_BLOCKS_DESCRIPTION,
    }),
    endings: lengthBoundedArray(ZMcpObjectInput, {
      max: V3_SURVEY_MAX_ENDINGS,
      description: "Survey endings using the v3 survey document contract.",
    }).optional(),
    hiddenFields: ZMcpObjectInput.optional().describe("Hidden fields using the v3 survey document contract."),
    variables: lengthBoundedArray(ZMcpObjectInput, {
      max: V3_SURVEY_MAX_VARIABLES,
      description: "Survey variables using the v3 survey document contract.",
    }).optional(),
    customCss: ZV3SurveyCustomCss.optional(),
  })
  .strict();

export const ZMcpPatchSurveyInput = z
  .object({
    surveyId: z.cuid2().describe("Survey ID to update."),
    data: z
      .record(z.string(), z.unknown())
      .describe(
        `Strict top-level v3 survey patch payload. Omitted top-level fields are preserved; provided objects and arrays replace that whole subtree. \`customCss\` is \`{ light, dark }\` source (both keys) or null to clear; omit it to keep the current CSS. ${SURVEY_BLOCKS_DESCRIPTION}`
      ),
  })
  .strict();

/**
 * Block-level editing (ENG-3069). The bodies are the v3 REST schemas plus `surveyId`, so the two
 * surfaces cannot drift: one Zod definition, one set of messages.
 *
 * `response_format` defaults to `concise` here but not on REST. A 31-block survey serializes to
 * ~15k tokens, and returning that from every edit would refill the agent's context as fast as the
 * old whole-array patch did — the concise payload carries `updatedAt`, which is precisely the
 * `expectedUpdatedAt` the next call needs, so edits chain without re-reading.
 */
const ZMcpBlockResponseFormat = z
  .enum(["concise", "detailed"])
  .default("concise")
  .describe(
    "concise (default) returns id, updatedAt, blockCount and the ops applied. detailed returns the full survey resource."
  );

export const ZMcpEditSurveyBlocksInput = ZV3EditSurveyBlocksBody.extend({
  surveyId: z.cuid2().describe("Survey ID whose blocks should be edited."),
  response_format: ZMcpBlockResponseFormat.optional(),
}).strict();

export const ZMcpSetSurveyBlockOrderInput = ZV3SetSurveyBlockOrderBody.extend({
  surveyId: z.cuid2().describe("Survey ID whose block order should be set."),
  response_format: ZMcpBlockResponseFormat.optional(),
}).strict();

export const ZMcpValidateSurveyInput = z
  .object({
    operation: z
      .enum(["create", "patch", "customCss"])
      .describe(
        "Validation operation to run. `customCss` processes custom CSS only and returns the compiled result and warnings."
      ),
    surveyId: z
      .cuid2()
      .optional()
      .describe(
        "Survey ID to validate against. Required for patch validation; optional for customCss with scope survey (must belong to workspaceId)."
      ),
    workspaceId: ZId.optional().describe(
      "Workspace ID. Required for, and only accepted by, customCss validation."
    ),
    scope: ZCustomCssScope.optional().describe(
      "customCss validation only: `workspace` (shared survey CSS) or `survey` (one survey's CSS)."
    ),
    data: ZMcpObjectInput.describe(
      `Create or patch payload to validate, or \`{ customCss: { light, dark } | null }\` for customCss. ${SURVEY_BLOCKS_DESCRIPTION}`
    ),
  })
  .strict();

export const ZMcpGetWorkspaceCustomCssInput = z
  .object({
    workspaceId: ZId.describe("Workspace ID whose shared survey CSS should be read."),
  })
  .strict();

export const ZMcpPatchWorkspaceCustomCssInput = ZV3WorkspaceCustomCssPatchBody.extend({
  workspaceId: ZId.describe("Workspace ID whose shared survey CSS should be saved or cleared."),
}).strict();

export const ZMcpDeleteSurveyInput = z
  .object({
    surveyId: z.cuid2().describe("Survey ID to delete."),
  })
  .strict();

// list_workspaces takes no arguments — it returns the workspaces the authenticated caller can access.
//
// The one schema where `.strict()` buys no ENG-2256 protection: with no declared keys there is nothing to
// misspell, so this is uniformity rather than a fix. Kept strict anyway, as a deliberate call rather than an
// oversight, but the asymmetry is worth knowing if a client ever trips on it. It advertises
// `{"type":"object","properties":{},"additionalProperties":false}`, and a client that pads a zero-argument
// call with a placeholder key would now fail here where v1 dropped it — costly out of proportion, because
// this is the discovery tool every workspace-scoped tool takes its `workspaceId` from, so losing it looks
// like the whole server being broken. Raised in review on #8859; no such client is confirmed, and our own
// QA only exercises the tested client, so treat a report of "the Forms MCP server won't connect" from
// another client as a reason to look here first.
export const ZMcpListWorkspacesInput = z.object({}).strict();

export type TMcpListSurveysInput = z.infer<typeof ZMcpListSurveysInput>;
export type TMcpListWorkspacesInput = z.infer<typeof ZMcpListWorkspacesInput>;
export type TMcpGetSurveyInput = z.infer<typeof ZMcpGetSurveyInput>;
export type TMcpCreateSurveyInput = z.infer<typeof ZMcpCreateSurveyInput>;
export type TMcpPatchSurveyInput = z.infer<typeof ZMcpPatchSurveyInput>;
export type TMcpEditSurveyBlocksInput = z.infer<typeof ZMcpEditSurveyBlocksInput>;
export type TMcpSetSurveyBlockOrderInput = z.infer<typeof ZMcpSetSurveyBlockOrderInput>;
export type TMcpValidateSurveyInput = z.infer<typeof ZMcpValidateSurveyInput>;
export type TMcpDeleteSurveyInput = z.infer<typeof ZMcpDeleteSurveyInput>;
export type TMcpGetWorkspaceCustomCssInput = z.infer<typeof ZMcpGetWorkspaceCustomCssInput>;
export type TMcpPatchWorkspaceCustomCssInput = z.infer<typeof ZMcpPatchWorkspaceCustomCssInput>;
