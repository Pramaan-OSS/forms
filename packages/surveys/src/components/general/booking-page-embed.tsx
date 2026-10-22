import { useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { getBookingPageUrl, isBookingPageEnabled } from "@forms/types/surveys/booking-page";
import type { TSurveyBookingPageElement } from "@forms/types/surveys/elements";

export const BOOKING_SANDBOX = "allow-forms allow-scripts";
export const BOOKING_PERMISSIONS =
  "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen 'none'";

export function BookingPageEmbed({ element }: Readonly<{ element: TSurveyBookingPageElement }>) {
  const { t } = useTranslation();
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = getBookingPageUrl(element);
  if (!isBookingPageEnabled(element) || !url)
    return <p>{t("booking_page.not_configured", { defaultValue: "Booking page is not enabled." })}</p>;
  // A refusal by another origin is not reliably observable. Keep the link visible at all times.
  return (
    <div className="mt-4 space-y-3">
      {failedUrl !== url && (
        <iframe
          title={t("booking_page.title", { defaultValue: "Booking page" })}
          src={url}
          sandbox={BOOKING_SANDBOX}
          allow={BOOKING_PERMISSIONS}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="border-border rounded-input h-[32rem] w-full border"
          onError={() => setFailedUrl(url)}
        />
      )}
      <p>
        {t("booking_page.fallback", {
          defaultValue: "If the page does not load here, open it in a new tab.",
        })}
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
        {t("booking_page.open", { defaultValue: "Open booking page" })}
      </a>
    </div>
  );
}
