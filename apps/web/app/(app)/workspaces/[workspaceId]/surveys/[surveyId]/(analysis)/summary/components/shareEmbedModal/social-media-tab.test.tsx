import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { SocialMediaTab } from "./social-media-tab";

vi.mock("@/lib/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const url = "https://forms.example.test/s/survey?existing=value";
const share = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  vi.mocked(copyToClipboard).mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "share");
});
const renderShare = () => render(<SocialMediaTab surveyUrl={url} surveyTitle="My survey" />);
const shareButton = () =>
  screen.getByRole("button", { name: "workspace.surveys.share.social_media.share_button" });

test("opens the browser picker with the exact survey link and title", async () => {
  share.mockResolvedValue(undefined);
  renderShare();
  fireEvent.click(shareButton());
  await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "My survey", url }));
  expect(copyToClipboard).not.toHaveBeenCalled();
});

test("keeps Copy link available when the browser has no share picker", async () => {
  Reflect.deleteProperty(navigator, "share");
  renderShare();
  expect(
    screen.queryByRole("button", { name: "workspace.surveys.share.social_media.share_button" })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "common.copy_link" }));
  await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(url));
  expect(toast.success).toHaveBeenCalledWith("common.copied_to_clipboard");
});

test("copies the link if sharing is refused", async () => {
  share.mockRejectedValue(new DOMException("Refused", "NotAllowedError"));
  renderShare();
  fireEvent.click(shareButton());
  await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(url));
});

test("does not copy anything when the user cancels the picker", async () => {
  share.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  renderShare();
  fireEvent.click(shareButton());
  await waitFor(() => expect(shareButton()).not.toBeDisabled());
  expect(copyToClipboard).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

test("reports a refused clipboard write without claiming success", async () => {
  vi.mocked(copyToClipboard).mockResolvedValue(false);
  renderShare();
  fireEvent.click(screen.getByRole("button", { name: "common.copy_link" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("common.failed_to_copy_to_clipboard"));
  expect(toast.success).not.toHaveBeenCalled();
});
