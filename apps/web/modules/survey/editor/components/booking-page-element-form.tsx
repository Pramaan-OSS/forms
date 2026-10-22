"use client";

import { PlusIcon } from "lucide-react";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { getBookingPageUrl, isBookingPageEnabled } from "@forms/types/surveys/booking-page";
import { TSurveyBookingPageElement, type TSurveyElement } from "@forms/types/surveys/elements";
import { TSurvey } from "@forms/types/surveys/types";
import { TUserLocale } from "@forms/types/user";
import { createI18nString, extractLanguageCodes } from "@/lib/i18n/utils";
import { ElementFormInput } from "@/modules/survey/components/element-form-input";
import { Button } from "@/modules/ui/components/button";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";
import { Switch } from "@/modules/ui/components/switch";

interface BookingPageElementFormProps {
  localSurvey: TSurvey;
  element: TSurveyBookingPageElement;
  elementIdx: number;
  updateElement: (elementIdx: number, updatedAttributes: Partial<TSurveyElement>) => void;
  lastElement: boolean;
  isInvalid: boolean;
  locale: TUserLocale;
  isStorageConfigured: boolean;
  isExternalUrlsAllowed?: boolean;
}

export const BookingPageElementForm = ({
  localSurvey,
  element,
  elementIdx,
  updateElement,
  isInvalid,
  locale,
  isStorageConfigured = true,
  isExternalUrlsAllowed,
}: BookingPageElementFormProps): JSX.Element => {
  const surveyLanguageCodes = extractLanguageCodes(localSurvey.languages);
  const { t } = useTranslation();
  return (
    <form>
      <ElementFormInput
        id="headline"
        value={element.headline}
        label={t("workspace.surveys.edit.question") + "*"}
        localSurvey={localSurvey}
        elementIdx={elementIdx}
        isInvalid={isInvalid}
        updateElement={updateElement}
        locale={locale}
        isStorageConfigured={isStorageConfigured}
        autoFocus={!element.headline?.default || element.headline.default.trim() === ""}
        isExternalUrlsAllowed={isExternalUrlsAllowed}
      />
      <div>
        {element.subheader !== undefined && (
          <div className="inline-flex w-full items-center">
            <div className="w-full">
              <ElementFormInput
                id="subheader"
                value={element.subheader}
                label={t("common.description")}
                localSurvey={localSurvey}
                elementIdx={elementIdx}
                isInvalid={isInvalid}
                updateElement={updateElement}
                locale={locale}
                isStorageConfigured={isStorageConfigured}
                autoFocus={!element.subheader?.default || element.subheader.default.trim() === ""}
                isExternalUrlsAllowed={isExternalUrlsAllowed}
              />
            </div>
          </div>
        )}
        {element.subheader === undefined && (
          <Button
            size="sm"
            className="mt-3"
            variant="secondary"
            type="button"
            onClick={() => {
              updateElement(elementIdx, {
                subheader: createI18nString("", surveyLanguageCodes),
              });
            }}>
            <PlusIcon className="mr-1 size-4" />
            {t("workspace.surveys.edit.add_description")}
          </Button>
        )}
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id={`booking-enabled-${element.id}`}
              checked={isBookingPageEnabled(element)}
              onCheckedChange={(enabled) => updateElement(elementIdx, { bookingEnabled: enabled })}
            />
            <Label htmlFor={`booking-enabled-${element.id}`}>
              {t("booking_page.enable", { defaultValue: "Enable booking page" })}
            </Label>
          </div>
          <Label htmlFor={`booking-url-${element.id}`}>
            {t("booking_page.url", { defaultValue: "Booking page URL" })}
          </Label>
          <Input
            id={`booking-url-${element.id}`}
            type="url"
            placeholder="https://scheduling.example.test/your-page"
            value={element.bookingUrl ?? getBookingPageUrl(element) ?? ""}
            onChange={(event) => updateElement(elementIdx, { bookingUrl: event.target.value })}
          />
          <p className="text-sm text-slate-600">
            {t("booking_page.owner_help", {
              defaultValue:
                "Paste the HTTPS URL of your self-hosted booking page, including a Scheduling template page. Some pages require opening in a new tab.",
            })}
          </p>
        </div>
      </div>
    </form>
  );
};
