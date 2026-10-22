import { useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { FB_PART } from "@forms/survey-ui/parts";
import { type TResponseData, type TResponseTtc } from "@forms/types/responses";
import { getBookingPageUrl, isBookingPageEnabled } from "@forms/types/surveys/booking-page";
import type { TSurveyBookingPageElement } from "@forms/types/surveys/elements";
import { BookingPageEmbed } from "@/components/general/booking-page-embed";
import { ElementMedia } from "@/components/general/element-media";
import { Headline } from "@/components/general/headline";
import { Subheader } from "@/components/general/subheader";
import { getLocalizedValue } from "@/lib/i18n";
import { getUpdatedTtc, useTtc } from "@/lib/ttc";

interface BookingPageElementProps {
  element: TSurveyBookingPageElement;
  value: string;
  onChange: (responseData: TResponseData) => void;
  languageCode: string;
  ttc: TResponseTtc;
  setTtc: (ttc: TResponseTtc) => void;
  currentElementId: string;
  errorMessage?: string;
}

export function BookingPageElement({
  element,
  value,
  onChange,
  languageCode,
  ttc,
  setTtc,
  currentElementId,
  errorMessage,
}: Readonly<BookingPageElementProps>) {
  const { t } = useTranslation();
  const [startTime, setStartTime] = useState(performance.now());
  const isMediaAvailable = element.imageUrl || element.videoUrl;
  useTtc(element.id, ttc, setTtc, startTime, setStartTime, element.id === currentElementId);

  return (
    <form
      key={element.id}
      onSubmit={(e) => {
        e.preventDefault();
        // Validation is handled by centralized system, just update TTC
        const updatedttc = getUpdatedTtc(ttc, element.id, performance.now() - startTime);
        setTtc(updatedttc);

        onChange({ [element.id]: value });
      }}
      className="w-full">
      <div>
        {isMediaAvailable ? (
          <ElementMedia
            imgUrl={element.imageUrl}
            videoUrl={element.videoUrl}
            altText={getLocalizedValue(element.imageAltText, languageCode)}
          />
        ) : null}
        <Headline headline={getLocalizedValue(element.headline, languageCode)} required={element.required && isBookingPageEnabled(element)} />
        <Subheader subheader={element.subheader ? getLocalizedValue(element.subheader, languageCode) : ""} />
        <BookingPageEmbed key={element.id} element={element} />
        {isBookingPageEnabled(element) && getBookingPageUrl(element) && (
          <div className="mt-4 space-y-2">
            <p>
              {t("booking_page.confirmation_note", {
                defaultValue: "Forms cannot verify bookings on this page. Confirm when you are finished.",
              })}
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value === "booked"}
                onChange={(event) => {
                  onChange({ [element.id]: event.currentTarget.checked ? "booked" : "" });
                  setTtc(getUpdatedTtc(ttc, element.id, performance.now() - startTime));
                }}
              />
              {t("booking_page.confirm", { defaultValue: "I have completed my booking" })}
            </label>
          </div>
        )}
        {errorMessage ? (
          <span
            className="text-red-500"
            data-fb-part={FB_PART.error}
            role="alert"
            aria-live="assertive"
            aria-atomic="true">
            {errorMessage}
          </span>
        ) : null}
      </div>
    </form>
  );
}
