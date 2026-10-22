import { type TFunction } from "i18next";
import { describe, expect, test } from "vitest";
import { TSurveyElementTypeEnum } from "@forms/types/surveys/constants";
import type { TSurvey } from "@forms/types/surveys/types";
import {
  applyReviewedTranslations,
  computeTranslationProgress,
  extractTranslatableStrings,
  setTranslationAtPathMutable,
} from "./utils";

const t = ((key: string, options?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    "common.choice_n": `Choice ${options?.n}`,
    "common.headline": "Headline",
    "common.other_placeholder": "Other Placeholder",
    "workspace.surveys.edit.please_specify": "Please specify",
    "workspace.surveys.edit.lower_label": "Lower label",
    "workspace.surveys.edit.upper_label": "Upper label",
  };

  return translations[key] ?? key;
}) as unknown as TFunction;

const createSurvey = (survey: Record<string, unknown>): TSurvey =>
  ({
    welcomeCard: { enabled: false },
    blocks: [],
    endings: [],
    metadata: {},
    ...survey,
  }) as unknown as TSurvey;

describe("multi-language survey utils", () => {
  test("extracts missing other option placeholders for single and multi select elements", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "single",
              type: TSurveyElementTypeEnum.MultipleChoiceSingle,
              headline: { default: "Pick one" },
              required: true,
              choices: [
                { id: "choice-1", label: { default: "One" } },
                { id: "choice-2", label: { default: "Two" } },
                { id: "other", label: { default: "Other" } },
              ],
            },
            {
              id: "multi",
              type: TSurveyElementTypeEnum.MultipleChoiceMulti,
              headline: { default: "Pick many" },
              required: true,
              choices: [
                { id: "choice-1", label: { default: "One" } },
                { id: "choice-2", label: { default: "Two" } },
                { id: "other", label: { default: "Other" } },
              ],
            },
          ],
        },
      ],
    });

    const strings = extractTranslatableStrings(survey, t);

    expect(strings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "blocks.0.elements.0.otherOptionPlaceholder",
          fieldLabel: "Other Placeholder",
          value: { default: "Please specify" },
        }),
        expect.objectContaining({
          path: "blocks.0.elements.1.otherOptionPlaceholder",
          fieldLabel: "Other Placeholder",
          value: { default: "Please specify" },
        }),
      ])
    );
  });

  test("extracts image alt text of elements, picture choices and endings, skipping empty ones", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "pic",
              type: TSurveyElementTypeEnum.PictureSelection,
              headline: { default: "Pick one" },
              required: true,
              allowMulti: false,
              imageUrl: "https://example.com/hero.jpg",
              imageAltText: { default: "Hero shot" },
              choices: [
                { id: "a", imageUrl: "https://example.com/a.jpg", imageAltText: { default: "Blue mug" } },
                { id: "b", imageUrl: "https://example.com/b.jpg", imageAltText: { default: "" } },
              ],
            },
          ],
        },
      ],
      endings: [
        {
          id: "end-1",
          type: "endScreen",
          headline: { default: "Thanks" },
          imageUrl: "https://example.com/thanks.jpg",
          imageAltText: { default: "Team waving" },
        },
      ],
    });

    const altPaths = extractTranslatableStrings(survey, t)
      .filter((s) => s.path.endsWith("imageAltText"))
      .map((s) => s.path);

    expect(altPaths).toEqual([
      "blocks.0.elements.0.imageAltText",
      "blocks.0.elements.0.choices.0.imageAltText",
      "endings.0.imageAltText",
    ]);
  });

  test("extracts the scale labels of csat and ces elements", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "csat",
              type: TSurveyElementTypeEnum.CSAT,
              headline: { default: "How satisfied are you?" },
              required: true,
              scale: "smiley",
              range: 5,
              lowerLabel: { default: "Not satisfied at all" },
              upperLabel: { default: "Very satisfied" },
            },
            {
              id: "ces",
              type: TSurveyElementTypeEnum.CES,
              headline: { default: "How easy was it?" },
              required: true,
              scale: "number",
              range: 5,
              lowerLabel: { default: "Very difficult" },
              upperLabel: { default: "Very easy" },
            },
          ],
        },
      ],
    });

    const strings = extractTranslatableStrings(survey, t);

    expect(strings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "blocks.0.elements.0.lowerLabel",
          fieldLabel: "Lower label",
          value: { default: "Not satisfied at all" },
        }),
        expect.objectContaining({
          path: "blocks.0.elements.0.upperLabel",
          fieldLabel: "Upper label",
          value: { default: "Very satisfied" },
        }),
        expect.objectContaining({
          path: "blocks.0.elements.1.lowerLabel",
          fieldLabel: "Lower label",
          value: { default: "Very difficult" },
        }),
        expect.objectContaining({
          path: "blocks.0.elements.1.upperLabel",
          fieldLabel: "Upper label",
          value: { default: "Very easy" },
        }),
      ])
    );
  });

  test("extracts a missing other option placeholder for ranking elements", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "ranking",
              type: TSurveyElementTypeEnum.Ranking,
              headline: { default: "Rank these" },
              required: true,
              choices: [
                { id: "choice-1", label: { default: "One" } },
                { id: "choice-2", label: { default: "Two" } },
                { id: "other", label: { default: "Other" } },
              ],
            },
          ],
        },
      ],
    });

    const strings = extractTranslatableStrings(survey, t);

    expect(strings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "blocks.0.elements.0.otherOptionPlaceholder",
          fieldLabel: "Other Placeholder",
          value: { default: "Please specify" },
        }),
      ])
    );
  });

  test("keeps existing other option placeholder translations when default text is empty", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "single",
              type: TSurveyElementTypeEnum.MultipleChoiceSingle,
              headline: { default: "Pick one" },
              required: true,
              choices: [
                { id: "choice-1", label: { default: "One" } },
                { id: "choice-2", label: { default: "Two" } },
                { id: "other", label: { default: "Other" } },
              ],
              otherOptionPlaceholder: { default: "", de: "Bitte angeben" },
            },
          ],
        },
      ],
    });

    const placeholder = extractTranslatableStrings(survey, t).find(
      (string) => string.path === "blocks.0.elements.0.otherOptionPlaceholder"
    );

    expect(placeholder?.value).toEqual({ default: "Please specify", de: "Bitte angeben" });
    expect(computeTranslationProgress([placeholder!], "de")).toEqual({
      translated: 1,
      total: 1,
      percentage: 100,
    });
  });

  test("does not extract stale other option placeholders without an other choice", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "single",
              type: TSurveyElementTypeEnum.MultipleChoiceSingle,
              headline: { default: "Pick one" },
              required: true,
              choices: [
                { id: "choice-1", label: { default: "One" } },
                { id: "choice-2", label: { default: "Two" } },
              ],
              otherOptionPlaceholder: { default: "Please specify" },
            },
          ],
        },
      ],
    });

    expect(
      extractTranslatableStrings(survey, t).some(
        (string) => string.path === "blocks.0.elements.0.otherOptionPlaceholder"
      )
    ).toBe(false);
  });

  test("creates a missing translatable field when saving a translation with a default value", () => {
    const survey = createSurvey({
      blocks: [
        {
          id: "block-1",
          elements: [
            {
              id: "single",
              type: TSurveyElementTypeEnum.MultipleChoiceSingle,
              headline: { default: "Pick one" },
              required: true,
              choices: [
                { id: "choice-1", label: { default: "One" } },
                { id: "choice-2", label: { default: "Two" } },
                { id: "other", label: { default: "Other" } },
              ],
            },
          ],
        },
      ],
    });

    setTranslationAtPathMutable(
      survey,
      "blocks.0.elements.0.otherOptionPlaceholder",
      "de",
      "Bitte angeben",
      "Please specify"
    );

    expect(survey.blocks[0].elements[0]).toMatchObject({
      otherOptionPlaceholder: { default: "Please specify", de: "Bitte angeben" },
    });
  });
});

describe("reviewed translation language matching", () => {
  const path = "blocks.0.elements.0.headline";
  const fixture = () =>
    createSurvey({
      languages: ["de-DE", "fr-FR"].map((code) => ({ language: { code } })),
      blocks: [{ elements: [{ headline: { default: "Hello", "de-DE": "Manual draft" } }] }],
    });
  test("matches lowercase and legacy result codes to saved language keys", () => {
    const original = fixture();
    const result = applyReviewedTranslations(original, "de-DE", { [path]: "Manual draft" }, [
      { path, language: "de-de", text: "Hallo" },
      { path, language: "fr", text: "Bonjour" },
    ]);
    expect(result.survey.blocks[0].elements[0].headline).toEqual({
      default: "Hello",
      "de-DE": "Hallo",
      "fr-FR": "Bonjour",
    });
    expect(result.drafts[path]).toBe("Hallo");
    expect(original.blocks[0].elements[0].headline).toEqual({ default: "Hello", "de-DE": "Manual draft" });
  });
  test("preserves the current draft when reviewing another language", () => {
    const result = applyReviewedTranslations(fixture(), "de-DE", { [path]: "Edited locally" }, [
      { path, language: "fr-fr", text: "Bonjour" },
    ]);
    expect(result.survey.blocks[0].elements[0].headline["de-DE"]).toBe("Edited locally");
    expect(result.drafts[path]).toBe("Edited locally");
  });
  test("ignores missing text and languages the survey does not offer", () => {
    const original = fixture();
    const result = applyReviewedTranslations(original, "de-DE", {}, [
      { path, language: "es", text: "Hola" },
      { path, language: "de", text: "" },
      { path, language: "not a language", text: "Ignored" },
    ]);
    expect(result.survey).toEqual(original);
    expect(result.drafts).toEqual({});
  });
});
