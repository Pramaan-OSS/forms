import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { TContactAttributes } from "@forms/types/contact-attribute";
import {
  DatabaseError,
  InvalidInputError,
  ResourceNotFoundError,
  UniqueConstraintError,
} from "@forms/types/errors";
import { TResponseInput } from "@forms/types/responses";
import { getOrganization } from "@/lib/organization/service";
import { calculateTtcTotal } from "@/lib/response/utils";
import { getOrganizationIdFromWorkspaceId } from "@/lib/utils/helper";
import { getContactByUserId } from "./contact";
import { createResponse, createResponseWithQuotaEvaluation, resolveCreateResponseContext } from "./response";

vi.mock("server-only", () => ({}));

let mockIsFormsCloud = false;

vi.mock("@/lib/constants", () => ({
  get IS_FORMS_CLOUD() {
    return mockIsFormsCloud;
  },
  ENCRYPTION_KEY: "test",
}));

vi.mock("@/lib/organization/service", () => ({
  getOrganization: vi.fn(),
}));

vi.mock("@/lib/utils/helper", () => ({
  getOrganizationIdFromWorkspaceId: vi.fn(),
}));

vi.mock("@/lib/response/utils", async (importOriginal) => ({
  // keep the real normalizeResponseLanguage; calculateTtcTotal stays mockable (tests configure it)
  ...(await importOriginal<typeof import("@/lib/response/utils")>()),
  calculateTtcTotal: vi.fn((ttc) => ttc),
}));

vi.mock("@/lib/utils/validate", () => ({
  validateInputs: vi.fn(),
}));

vi.mock("@forms/database", () => ({
  prisma: {
    response: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@forms/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("./contact", () => ({
  getContactByUserId: vi.fn(),
}));

const workspaceId = "test-workspace-id";
const surveyId = "test-survey-id";
const organizationId = "test-organization-id";
const responseId = "test-response-id";

const mockOrganization = {
  id: organizationId,
  name: "Test Org",
  billing: {
    limits: { monthly: { responses: 100 } },
  },
};

const mockResponseInput: TResponseInput = {
  workspaceId,
  surveyId,
  userId: null,
  finished: false,
  data: { question1: "answer1" },
  meta: { source: "web" },
  ttc: { question1: 1000 },
};

const mockResponsePrisma = {
  id: responseId,
  createdAt: new Date(),
  updatedAt: new Date(),
  surveyId,
  finished: false,
  data: { question1: "answer1" },
  meta: { source: "web" },
  ttc: { question1: 1000 },
  variables: {},
  contactAttributes: {},
  singleUseId: null,
  language: null,
  displayId: null,
  tags: [],
};

const noContact = { contact: null };

type TResolvedContact = { id: string; attributes: TContactAttributes };
type TOrganizationResult = Awaited<ReturnType<typeof getOrganization>>;

type MockTx = {
  response: {
    create: ReturnType<typeof vi.fn>;
  };
};
let mockTx: MockTx;

describe("createResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOrganizationIdFromWorkspaceId).mockResolvedValue(organizationId);
    vi.mocked(getOrganization).mockResolvedValue(mockOrganization as any);
    vi.mocked(prisma.response.create).mockResolvedValue(mockResponsePrisma as any);
    vi.mocked(calculateTtcTotal).mockImplementation((ttc) => ttc);
  });

  afterEach(() => {
    mockIsFormsCloud = false;
  });

  test("should handle finished response and calculate TTC", async () => {
    const finishedInput = { ...mockResponseInput, finished: true };
    await createResponse(finishedInput, noContact, prisma);
    expect(calculateTtcTotal).toHaveBeenCalledWith(mockResponseInput.ttc);
    expect(prisma.response.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finished: true }),
      })
    );
  });

  test("should persist endingId when provided", async () => {
    await createResponse(
      { ...mockResponseInput, finished: true, endingId: "ending-card-id" },
      noContact,
      prisma
    );
    expect(prisma.response.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finished: true, endingId: "ending-card-id" }),
      })
    );
  });

  test("should default endingId to null when not provided", async () => {
    await createResponse(mockResponseInput, noContact, prisma);
    expect(prisma.response.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ endingId: null }),
      })
    );
  });

  test("should throw DatabaseError on Prisma known request error", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError("Test Prisma Error", {
      code: "P2025",
      clientVersion: "test",
    });
    vi.mocked(prisma.response.create).mockRejectedValue(prismaError);
    await expect(createResponse(mockResponseInput, noContact, prisma)).rejects.toThrow(DatabaseError);
  });

  test("should throw UniqueConstraintError on P2002 with singleUseId target", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { driverAdapterError: { cause: { constraint: { fields: ["surveyId", "singleUseId"] } } } },
    });
    vi.mocked(prisma.response.create).mockRejectedValue(prismaError);
    await expect(createResponse(mockResponseInput, noContact, prisma)).rejects.toThrow(UniqueConstraintError);
  });

  test("should throw InvalidInputError on P2002 with displayId target (race condition)", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { driverAdapterError: { cause: { constraint: { fields: ["displayId"] } } } },
    });
    vi.mocked(prisma.response.create).mockRejectedValue(prismaError);
    await expect(createResponse(mockResponseInput, noContact, prisma)).rejects.toThrow(InvalidInputError);
  });

  test("should throw original error on other Prisma errors", async () => {
    const genericError = new Error("Generic database error");
    vi.mocked(prisma.response.create).mockRejectedValue(genericError);
    await expect(createResponse(mockResponseInput, noContact, prisma)).rejects.toThrow(genericError);
  });
});

describe("resolveCreateResponseContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOrganizationIdFromWorkspaceId).mockResolvedValue(organizationId);
    vi.mocked(getOrganization).mockResolvedValue(mockOrganization as TOrganizationResult);
  });

  test("throws ResourceNotFoundError if the organization is not found", async () => {
    vi.mocked(getOrganization).mockResolvedValue(null);
    await expect(resolveCreateResponseContext(mockResponseInput)).rejects.toThrow(ResourceNotFoundError);
  });

  test("resolves the contact by userId when one is given", async () => {
    const contact: TResolvedContact = { id: "contact-id", attributes: { userId: "user-1" } };
    vi.mocked(getContactByUserId).mockResolvedValue(contact);

    await expect(resolveCreateResponseContext({ workspaceId, userId: "user-1" })).resolves.toEqual({
      contact,
    });
    expect(getContactByUserId).toHaveBeenCalledWith(workspaceId, "user-1");
  });

  test("maps a Prisma error from the contact lookup to DatabaseError", async () => {
    vi.mocked(getContactByUserId).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("lookup failed", { code: "P2039", clientVersion: "test" })
    );
    await expect(resolveCreateResponseContext({ workspaceId, userId: "user-1" })).rejects.toThrow(
      DatabaseError
    );
  });

  test("resolves no contact and skips the lookup without a userId", async () => {
    await expect(resolveCreateResponseContext(mockResponseInput)).resolves.toEqual({ contact: null });
    expect(getContactByUserId).not.toHaveBeenCalled();
  });
});

describe("createResponseWithQuotaEvaluation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTx = {
      response: {
        create: vi.fn(),
      },
    };
    prisma.$transaction = vi.fn(async (cb: any) => cb(mockTx));
    vi.mocked(getOrganizationIdFromWorkspaceId).mockResolvedValue(organizationId);
    vi.mocked(getOrganization).mockResolvedValue(mockOrganization as any);
    vi.mocked(mockTx.response.create).mockResolvedValue(mockResponsePrisma as any);
    vi.mocked(calculateTtcTotal).mockImplementation((ttc) => ttc);
  });

  afterEach(() => {
    mockIsFormsCloud = false;
  });

  test("creates the response through its own transaction and returns it", async () => {
    const result = await createResponseWithQuotaEvaluation(mockResponseInput);

    // No quota evaluation runs anymore; the response is written and returned as stored.
    expect(result).toEqual({
      id: responseId,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      surveyId,
      finished: false,
      data: { question1: "answer1" },
      meta: { source: "web" },
      ttc: { question1: 1000 },
      variables: {},
      contactAttributes: {},
      singleUseId: null,
      language: null,
      displayId: null,
      contact: null,
      tags: [],
    });
    expect(result).not.toHaveProperty("quotaFull");
  });

  test("should reuse a caller-supplied transaction instead of opening its own", async () => {
    // A caller that persists a response as part of a larger all-or-nothing write passes its own
    // transaction. Opening a second one here would commit the response independently, so the caller's
    // rollback would leave it behind.
    const callerTx: MockTx = { response: { create: vi.fn() } };
    callerTx.response.create.mockResolvedValue(mockResponsePrisma);

    const result = await createResponseWithQuotaEvaluation(
      mockResponseInput,
      // No ingest flags on this path; the transaction and the response context read before it opened
      // come in as the third argument.
      undefined,
      { tx: callerTx as unknown as Prisma.TransactionClient, responseContext: noContact }
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(callerTx.response.create).toHaveBeenCalled();
    expect(mockTx.response.create).not.toHaveBeenCalled();
    // The caller read the context before its transaction, so nothing is read here.
    expect(getOrganizationIdFromWorkspaceId).not.toHaveBeenCalled();
    expect(getOrganization).not.toHaveBeenCalled();
    expect(result.id).toBe(responseId);
  });

  test("resolves the organization and contact, and the contact reaches the written row", async () => {
    const contact: TResolvedContact = { id: "contact-id", attributes: { userId: "user-1" } };
    vi.mocked(getContactByUserId).mockResolvedValue(contact);
    mockTx.response.create.mockResolvedValue(mockResponsePrisma);

    const result = await createResponseWithQuotaEvaluation({ ...mockResponseInput, userId: "user-1" });

    expect(getContactByUserId).toHaveBeenCalledWith(mockResponseInput.workspaceId, "user-1");
    expect(mockTx.response.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contact: { connect: { id: contact.id } } }),
      })
    );
    expect(result.contact).toEqual({ id: contact.id, userId: "user-1" });
  });
});
