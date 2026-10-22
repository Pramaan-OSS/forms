import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TResponse } from "@forms/types/responses";
import type { TSurvey } from "@forms/types/surveys/types";
import { sendResponseFinishedEmail } from "./index";

const {
  mockRenderResponseFinishedEmail,
  mockGetOrganizationByWorkspaceId,
  mockGetElementResponseMapping,
  mockResolveStorageUrl,
  mockGetTranslate,
  mockEmailSend,
} = vi.hoisted(() => ({
  mockRenderResponseFinishedEmail: vi.fn(),
  mockGetOrganizationByWorkspaceId: vi.fn(),
  mockGetElementResponseMapping: vi.fn(),
  mockResolveStorageUrl: vi.fn(),
  mockGetTranslate: vi.fn(),
  mockEmailSend: vi.fn(async () => ({ status: "queued", ref: "fixture" })),
}));

vi.mock("@forms/email", () => ({
  renderResponseFinishedEmail: mockRenderResponseFinishedEmail,
}));

vi.mock("@/lib/organization/service", () => ({
  getOrganizationByWorkspaceId: mockGetOrganizationByWorkspaceId,
}));

vi.mock("@/lib/responses", () => ({
  getElementResponseMapping: mockGetElementResponseMapping,
}));

vi.mock("@/modules/storage/utils", () => ({
  resolveStorageUrl: mockResolveStorageUrl,
}));

vi.mock("@/i18n/server", () => ({
  getTranslate: mockGetTranslate,
}));

// No Pramaan key reaches the network in tests. Stub the client so `sendEmail`'s
// side effect stays local; the assertions only care about the render call.
vi.mock("@/lib/pramaan", () => ({
  pramaan: { emailSend: mockEmailSend },
  pramaanConfigured: true,
  unavailableMessage: (error: unknown) => String(error),
}));

const survey = { id: "survey1", name: "Survey", variables: [], hiddenFields: {} } as unknown as TSurvey;
const response = { id: "response1", data: {}, variables: {} } as unknown as TResponse;

describe("sendResponseFinishedEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTranslate.mockResolvedValue((key: string) => key);
    mockGetElementResponseMapping.mockReturnValue([]);
    mockRenderResponseFinishedEmail.mockResolvedValue("<html>rendered</html>");
    mockResolveStorageUrl.mockImplementation((url: string) => `https://cdn.example.com${url}`);
  });

  // This is the exact regression: the organization's whitelabel logo was fetched but never
  // threaded into the template, so the notification email always fell back to the hard-coded
  // Forms logo regardless of what the organization had configured.
  test("resolves the organization's whitelabel logo to an absolute URL", async () => {
    mockGetOrganizationByWorkspaceId.mockResolvedValue({
      id: "org1",
      whitelabel: { logoUrl: "/storage/wsp123/public/logo--fid--abc.png" },
    });

    await sendResponseFinishedEmail("owner@example.com", "en-US", "workspace1", survey, response, 1);

    expect(mockResolveStorageUrl).toHaveBeenCalledWith("/storage/wsp123/public/logo--fid--abc.png");
    expect(mockRenderResponseFinishedEmail.mock.calls[0][0].logoUrl).toBe(
      "https://cdn.example.com/storage/wsp123/public/logo--fid--abc.png"
    );
  });

  test.each([
    ["no whitelabel object", undefined],
    ["a whitelabel object with no logo", {}],
  ])("leaves the logo unset for %s, so the default Forms logo applies", async (_label, whitelabel) => {
    mockGetOrganizationByWorkspaceId.mockResolvedValue({ id: "org1", whitelabel });

    await sendResponseFinishedEmail("owner@example.com", "en-US", "workspace1", survey, response, 1);

    expect(mockResolveStorageUrl).not.toHaveBeenCalled();
    expect(mockRenderResponseFinishedEmail.mock.calls[0][0].logoUrl).toBeUndefined();
  });
});
