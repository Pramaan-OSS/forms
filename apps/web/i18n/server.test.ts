import { beforeEach, describe, expect, test, vi } from "vitest";
import { getLocale } from "@/i18n/language";
import { getTranslate } from "./server";

vi.mock("@/i18n/language", () => ({
  getLocale: vi.fn(),
}));

vi.mock("@/i18n/shared", () => ({
  DEFAULT_LANGUAGE: "en-US",
}));

describe("i18n server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should get translate", async () => {
    vi.mocked(getLocale).mockResolvedValue("en-US");
    const translate = await getTranslate();
    expect(translate).toBeDefined();
  });

  test("should get translate with default locale", async () => {
    vi.mocked(getLocale).mockResolvedValue(undefined as any);
    const translate = await getTranslate();
    expect(translate).toBeDefined();
  });

  test("should use provided locale instead of calling getLocale", async () => {
    const translate = await getTranslate("de-DE");
    expect(getLocale).not.toHaveBeenCalled();
    expect(translate).toBeDefined();
  });

  test("should call getLocale when locale is not provided", async () => {
    vi.mocked(getLocale).mockResolvedValue("fr-FR");
    await getTranslate();
    expect(getLocale).toHaveBeenCalled();
  });
});
