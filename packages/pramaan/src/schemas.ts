// The real schemas this product sends to generation calls. One test runs
// every one of them through the bounded-subset validator, so a schema the
// service would refuse fails here first. Each is derived from the zod schema
// its call site validates the reply with (noted beside it).
import type { ToolDef } from "./capabilities";

/** The survey draft the editor saves (`app/api/v3/surveys/generate`). */
export const SURVEY_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    language: {
      type: "string",
      enum: [
        "de-DE",
        "en-US",
        "es-ES",
        "fr-FR",
        "hu-HU",
        "ja-JP",
        "nl-NL",
        "pt-BR",
        "pt-PT",
        "ro-RO",
        "ru-RU",
        "sv-SE",
        "tr-TR",
        "zh-Hans-CN",
        "zh-Hant-TW",
      ],
    },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 220,
    },
    description: {
      anyOf: [
        {
          type: "string",
          minLength: 1,
          maxLength: 320,
        },
        {
          type: "null",
        },
      ],
    },
    welcomeCard: {
      anyOf: [
        {
          type: "object",
          properties: {
            enabled: {
              type: "boolean",
            },
            headline: {
              anyOf: [
                {
                  type: "string",
                  minLength: 1,
                  maxLength: 220,
                },
                {
                  type: "null",
                },
              ],
            },
            subheader: {
              anyOf: [
                {
                  type: "string",
                  minLength: 1,
                  maxLength: 320,
                },
                {
                  type: "null",
                },
              ],
            },
            buttonLabel: {
              anyOf: [
                {
                  type: "string",
                  minLength: 1,
                  maxLength: 220,
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: ["enabled", "headline", "subheader", "buttonLabel"],
          additionalProperties: false,
        },
        {
          type: "null",
        },
      ],
    },
    ending: {
      anyOf: [
        {
          type: "object",
          properties: {
            headline: {
              anyOf: [
                {
                  type: "string",
                  minLength: 1,
                  maxLength: 220,
                },
                {
                  type: "null",
                },
              ],
            },
            subheader: {
              anyOf: [
                {
                  type: "string",
                  minLength: 1,
                  maxLength: 320,
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: ["headline", "subheader"],
          additionalProperties: false,
        },
        {
          type: "null",
        },
      ],
    },
    blocks: {
      minItems: 1,
      maxItems: 8,
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 220,
          },
          questions: {
            minItems: 1,
            maxItems: 4,
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "openText",
                    "multipleChoiceSingle",
                    "multipleChoiceMulti",
                    "nps",
                    "rating",
                    "csat",
                    "ces",
                    "ranking",
                    "matrix",
                    "date",
                  ],
                },
                headline: {
                  type: "string",
                  minLength: 1,
                  maxLength: 220,
                },
                subheader: {
                  anyOf: [
                    {
                      type: "string",
                      minLength: 1,
                      maxLength: 320,
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                required: {
                  type: "boolean",
                },
                placeholder: {
                  anyOf: [
                    {
                      type: "string",
                      minLength: 1,
                      maxLength: 120,
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                longAnswer: {
                  anyOf: [
                    {
                      type: "boolean",
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                choices: {
                  anyOf: [
                    {
                      minItems: 2,
                      maxItems: 8,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                        maxLength: 80,
                      },
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                rows: {
                  anyOf: [
                    {
                      minItems: 2,
                      maxItems: 8,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                        maxLength: 80,
                      },
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                columns: {
                  anyOf: [
                    {
                      minItems: 2,
                      maxItems: 8,
                      type: "array",
                      items: {
                        type: "string",
                        minLength: 1,
                        maxLength: 80,
                      },
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                lowerLabel: {
                  anyOf: [
                    {
                      type: "string",
                      minLength: 1,
                      maxLength: 60,
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                upperLabel: {
                  anyOf: [
                    {
                      type: "string",
                      minLength: 1,
                      maxLength: 60,
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                scale: {
                  anyOf: [
                    {
                      type: "string",
                      enum: ["number", "smiley", "star"],
                    },
                    {
                      type: "null",
                    },
                  ],
                },
                range: {
                  anyOf: [
                    {
                      type: "string",
                      enum: ["5", "7", "10"],
                    },
                    {
                      type: "null",
                    },
                  ],
                },
              },
              required: [
                "type",
                "headline",
                "subheader",
                "required",
                "placeholder",
                "longAnswer",
                "choices",
                "lowerLabel",
                "upperLabel",
                "scale",
                "range",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "questions"],
        additionalProperties: false,
      },
    },
  },
  required: ["language", "name", "description", "welcomeCard", "ending", "blocks"],
  additionalProperties: false,
} as const;

/** How one imported survey's questions become Forms questions (`modules/survey/import/qsf`). */
export const QSF_IMPORT_PLAN_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: {
            type: "string",
            description: "The question's ref, e.g. QID3",
          },
          type: {
            type: "string",
            enum: [
              "openText",
              "multipleChoiceSingle",
              "multipleChoiceMulti",
              "matrix",
              "nps",
              "rating",
              "csat",
              "ces",
              "ranking",
              "date",
              "fileUpload",
              "contactInfo",
              "consent",
              "cta",
            ],
          },
          required: {
            type: "boolean",
          },
          choicesFrom: {
            anyOf: [
              {
                type: "string",
                enum: ["choices", "answers"],
              },
              {
                type: "null",
              },
            ],
          },
          rowsFrom: {
            anyOf: [
              {
                type: "string",
                enum: ["choices", "answers"],
              },
              {
                type: "null",
              },
            ],
          },
          columnsFrom: {
            anyOf: [
              {
                type: "string",
                enum: ["choices", "answers"],
              },
              {
                type: "null",
              },
            ],
          },
          otherChoiceKey: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          noneChoiceKey: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          labelKey: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          excludedKeys: {
            type: "array",
            items: {
              type: "string",
            },
          },
          contactFields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: {
                  type: "string",
                  enum: ["firstName", "lastName", "email", "phone", "company"],
                },
                key: {
                  type: "string",
                },
              },
              required: ["field", "key"],
            },
          },
          inputType: {
            anyOf: [
              {
                type: "string",
                enum: ["text", "email", "url", "number", "phone"],
              },
              {
                type: "null",
              },
            ],
          },
          scale: {
            anyOf: [
              {
                type: "string",
                enum: ["number", "smiley", "star"],
              },
              {
                type: "null",
              },
            ],
          },
          range: {
            anyOf: [
              {
                type: "string",
                enum: ["3", "4", "5", "6", "7", "10"],
              },
              {
                type: "null",
              },
            ],
          },
          logicNotes: {
            type: "array",
            items: {
              type: "string",
            },
            description: "One sentence per logic rule of the question",
          },
        },
        required: [
          "ref",
          "type",
          "required",
          "choicesFrom",
          "rowsFrom",
          "columnsFrom",
          "otherChoiceKey",
          "noneChoiceKey",
          "labelKey",
          "excludedKeys",
          "contactFields",
          "inputType",
          "scale",
          "range",
          "format",
          "logicNotes",
        ],
      },
      description: "Every question that becomes a Forms question",
    },
    skipped: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: {
            type: "string",
          },
          reason: {
            type: "string",
            description: "Why, in one short sentence",
          },
        },
        required: ["ref", "reason"],
      },
      description: "Questions Forms cannot represent",
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The page's id, e.g. p3",
          },
          logicNotes: {
            type: "array",
            items: {
              type: "string",
            },
            description: "One sentence per branch or randomizer rule of the page",
          },
        },
        required: ["id", "logicNotes"],
      },
      description: "Only pages that have logic rules",
    },
  },
  required: ["questions", "skipped", "pages"],
} as const;

/** Example answers for open-text questions in one example-response row (`summary/lib/example-responses`). */
export const OPEN_TEXT_ANSWERS_SCHEMA = {
  type: "object",
  properties: {
    responses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowId: {
            type: "string",
            minLength: 1,
          },
          answers: {
            type: "array",
            default: [],
            items: {
              type: "object",
              properties: {
                elementId: {
                  type: "string",
                  minLength: 1,
                },
                answer: {
                  type: "string",
                  minLength: 1,
                },
              },
              required: ["elementId", "answer"],
              additionalProperties: false,
            },
          },
        },
        required: ["rowId"],
        additionalProperties: false,
      },
      default: [],
    },
  },
  required: ["responses"],
  additionalProperties: false,
} as const;

export const ALL_SCHEMAS: ReadonlyArray<Record<string, unknown>> = [
  SURVEY_DRAFT_SCHEMA as Record<string, unknown>,
  QSF_IMPORT_PLAN_SCHEMA as Record<string, unknown>,
  OPEN_TEXT_ANSWERS_SCHEMA as Record<string, unknown>,
];

export const ALL_TOOLS: ReadonlyArray<ToolDef> = [];
