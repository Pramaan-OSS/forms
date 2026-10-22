// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type TSurveyBookingPageElement, TSurveyElementTypeEnum } from "@forms/types/surveys/elements";
import { BookingPageElement } from "../elements/booking-page-element";
import { BookingPageEmbed } from "./booking-page-embed";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue: string }) => options?.defaultValue ?? _key,
  }),
}));
afterEach(cleanup);
const element: TSurveyBookingPageElement = {
  id: "booking1",
  type: TSurveyElementTypeEnum.BookingPage,
  headline: { default: "Book" },
  required: false,
  bookingEnabled: true,
  bookingUrl: "https://scheduling.example.test/alice",
};
describe("booking page frame", () => {
  test("allows only the sandbox features needed by the embedded page", () => {
    const { container } = render(<BookingPageEmbed element={element} />);
    const frame = screen.getByTitle("Booking page");
    expect(frame.getAttribute("src")).toBe(element.bookingUrl);
    expect(frame.getAttribute("sandbox")?.split(" ").sort()).toEqual(["allow-forms", "allow-scripts"]);
    expect(frame.getAttribute("allow")).toContain("camera 'none'");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.hasAttribute("srcdoc")).toBe(false);
    expect(container.querySelectorAll("script")).toHaveLength(0);
    const link = screen.getByRole("link", { name: "Open booking page" });
    expect(link.getAttribute("href")).toBe(element.bookingUrl);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });
  test("keeps the fallback link available before and after a frame error", () => {
    render(<BookingPageEmbed element={element} />);
    expect(screen.getByRole("link")).toBeDefined();
    fireEvent.error(screen.getByTitle("Booking page"));
    expect(screen.queryByTitle("Booking page")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe(element.bookingUrl);
  });
  test.each([
    { bookingEnabled: false },
    { bookingUrl: "javascript:alert(1)" },
    { bookingUrl: "http://example.test" },
  ])("never renders a frame or link when off or unsafe: %j", (settings) => {
    const { container } = render(<BookingPageEmbed element={{ ...element, ...settings }} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
  test("renders a saved custom-host URL without an injected script", () => {
    render(
      <BookingPageEmbed
        element={{
          ...element,
          bookingUrl: undefined,
          bookingEnabled: undefined,
          calHost: "scheduling.example.test",
          calUserName: "alice",
        }}
      />
    );
    expect(screen.getByTitle("Booking page").getAttribute("src")).toBe(element.bookingUrl);
  });
});

test("page loading and untrusted messages cannot confirm a booking", () => {
  const onChange = vi.fn();
  render(
    <BookingPageElement
      element={element}
      value=""
      onChange={onChange}
      languageCode="default"
      ttc={{}}
      setTtc={vi.fn()}
      currentElementId={element.id}
    />
  );
  fireEvent.load(screen.getByTitle("Booking page"));
  window.dispatchEvent(
    new MessageEvent("message", { origin: "https://scheduling.example.test", data: { status: "booked" } })
  );
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "I have completed my booking" }));
  expect(onChange).toHaveBeenCalledWith({ booking1: "booked" });
});
