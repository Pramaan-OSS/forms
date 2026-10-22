import { afterEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { PrismaErrorType } from "@forms/database/types/error";
import { DatabaseError, ResourceNotFoundError } from "@forms/types/errors";
import { TSurvey } from "@forms/types/surveys/types";
import { getSurvey, selectSurvey } from "./survey";

// Mock prisma
vi.mock("@forms/database", () => ({
  prisma: {
    survey: {
      findUnique: vi.fn(),
    },
    organizationBilling: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock transformPrismaSurvey
vi.mock("@/modules/survey/lib/utils", () => ({
  transformPrismaSurvey: vi.fn((survey) => survey),
}));

describe("Survey Library Tests", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getSurvey", () => {
    test("should return survey when found", async () => {
      const mockSurvey = { id: "survey_123", name: "Test Survey" } as unknown as TSurvey;
      vi.mocked(prisma.survey.findUnique).mockResolvedValueOnce(mockSurvey as any); // Type assertion needed due to complex select

      const survey = await getSurvey("survey_123");
      expect(survey).toEqual(mockSurvey);
      expect(prisma.survey.findUnique).toHaveBeenCalledWith({
        where: { id: "survey_123" },
        select: expect.any(Object), // selectSurvey is a large object, checking for existence
      });
    });

    test("should throw ResourceNotFoundError when survey not found", async () => {
      vi.mocked(prisma.survey.findUnique).mockResolvedValueOnce(null);
      await expect(getSurvey("survey_nonexistent")).rejects.toThrow(ResourceNotFoundError);
    });

    test("should throw DatabaseError on Prisma client known request error", async () => {
      const mockErrorMessage = "Prisma error";
      const errToThrow = new Prisma.PrismaClientKnownRequestError(mockErrorMessage, {
        code: PrismaErrorType.UniqueConstraintViolation,
        clientVersion: "0.0.1",
      });

      vi.mocked(prisma.survey.findUnique).mockRejectedValue(errToThrow);
      await expect(getSurvey("survey_dberror")).rejects.toThrow(DatabaseError);
    });

    test("should throw other errors", async () => {
      const genericError = new Error("Generic error");
      vi.mocked(prisma.survey.findUnique).mockRejectedValueOnce(genericError);
      await expect(getSurvey("survey_error")).rejects.toThrow(genericError);
    });
  });
});

describe("selectSurvey", () => {
  // ENG-3282: the survey editor loads its survey through this select and validates it on the client
  // with ZSurvey before publishing. A required field missing here makes Publish silently do nothing.
  test("selects the visibility facts TSurvey requires", () => {
    for (const column of [
      "visibility",
      "ownerId",
      "visibilityVersion",
      "visibilityProjectedVersion",
      "visibilityChangedAt",
      "visibilityChangedById",
    ] as const) {
      expect(selectSurvey).toHaveProperty(column, true);
    }
  });
});
