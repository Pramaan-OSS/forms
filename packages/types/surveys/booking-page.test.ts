import { describe, expect, test } from "vitest";
import { getBookingPageUrl, isBookingPageEnabled, parseBookingPageUrl } from "./booking-page";
import { TSurveyElementTypeEnum, ZSurveyBookingPageElement } from "./elements";

const base = {
  id: "booking1",
  type: TSurveyElementTypeEnum.BookingPage,
  headline: { default: "Book" },
  required: false,
};
describe("booking page URL policy", () => {
  test.each([
    "http://example.test/page",
    "javascript:alert(1)",
    "data:text/html,hello",
    "blob:https://example.test/a",
    "//example.test",
    "https://user:secret@example.test",
    "https://example.test/with space",
    "https://example.test/\npath",
    "https:\\example.test",
    "not a URL",
  ])("rejects %s", (url) => {
    expect(parseBookingPageUrl(url)).toBeUndefined();
    expect(
      ZSurveyBookingPageElement.safeParse({ ...base, bookingUrl: url, bookingEnabled: true }).success
    ).toBe(false);
  });
  test("accepts an operator's HTTPS page with its path, port and query intact", () => {
    const url = "https://scheduling.example.test:8443/team/intro?duration=30";
    expect(parseBookingPageUrl(url)).toBe(url);
    expect(
      ZSurveyBookingPageElement.parse({ ...base, bookingUrl: url, bookingEnabled: true }).bookingUrl
    ).toBe(url);
  });
  test("starts off without requiring a URL", () => {
    const element = ZSurveyBookingPageElement.parse({ ...base, bookingEnabled: false, bookingUrl: "" });
    expect(isBookingPageEnabled(element)).toBe(false);
    expect(getBookingPageUrl(element)).toBeUndefined();
    expect(ZSurveyBookingPageElement.safeParse({ ...base, bookingEnabled: true }).success).toBe(false);
  });
  test("preserves a saved explicit URL and its enabled state", () => {
    const saved = { bookingUrl: "https://scheduling.example.test/alice" };
    expect(getBookingPageUrl(saved)).toBe(saved.bookingUrl);
    expect(isBookingPageEnabled(saved)).toBe(true);
    expect(isBookingPageEnabled({ ...saved, bookingEnabled: false })).toBe(false);
  });
  test("preserves saved custom host and page values without a default hosted service", () => {
    expect(
      getBookingPageUrl({ calHost: "scheduling.example.test", calUserName: "alice/intro?duration=30" })
    ).toBe("https://scheduling.example.test/alice/intro?duration=30");
    expect(getBookingPageUrl({ calUserName: "https://scheduling.example.test/alice" })).toBe(
      "https://scheduling.example.test/alice"
    );
    expect(getBookingPageUrl({ calUserName: "alice/intro" })).toBeUndefined();
  });
  test("does not resurrect an old URL after the owner clears or replaces it", () => {
    const old = { calHost: "scheduling.example.test", calUserName: "alice" };
    expect(getBookingPageUrl({ ...old, bookingUrl: "" })).toBeUndefined();
    expect(getBookingPageUrl({ ...old, bookingUrl: "javascript:alert(1)" })).toBeUndefined();
  });
});
