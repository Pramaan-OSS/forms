import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { TResponse, TResponseInput } from "@forms/types/responses";
import { updateResponse } from "@/lib/response/service";
import { updateResponseWithQuotaEvaluation } from "./response";

vi.mock("@/lib/response/service");

const mockUpdateResponse = vi.mocked(updateResponse);

type MockTx = {
  response: {
    update: ReturnType<typeof vi.fn>;
  };
};
let mockTx: MockTx;

describe("updateResponseWithQuotaEvaluation", () => {
  const mockResponseId = "response123";
  const mockResponseInput: Partial<TResponseInput> = {
    data: { question1: "answer1" },
    finished: true,
    language: "en",
  };

  const mockResponse: TResponse = {
    id: "response123",
    surveyId: "survey123",
    finished: true,
    data: { question1: "answer1" },
    meta: {},
    ttc: {},
    variables: { var1: "value1" },
    contactAttributes: {},
    singleUseId: null,
    language: "en",
    displayId: null,
    endingId: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    contact: {
      id: "contact123",
      userId: "user123",
    },
    tags: [
      {
        id: "tag123",
        name: "important",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        workspaceId: "workspace123",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx = {
      response: {
        update: vi.fn(),
      },
    };
    prisma.$transaction = vi.fn(async (cb: any) => cb(mockTx));
  });

  test("updates the response inside one transaction and returns the result", async () => {
    mockUpdateResponse.mockResolvedValue(mockResponse);

    const result = await updateResponseWithQuotaEvaluation(mockResponseId, mockResponseInput);

    expect(result).toEqual(mockResponse);
    expect(mockUpdateResponse).toHaveBeenCalledWith(mockResponseId, mockResponseInput, mockTx);
  });

  test("propagates the update failure after the transaction rolls back", async () => {
    mockUpdateResponse.mockRejectedValue(new Error("update failed"));

    await expect(updateResponseWithQuotaEvaluation(mockResponseId, mockResponseInput)).rejects.toThrow(
      "update failed"
    );
  });
});
