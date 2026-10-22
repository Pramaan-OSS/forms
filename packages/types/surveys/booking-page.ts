/** Only explicitly supplied HTTPS pages may be embedded or linked. */
export function parseBookingPageUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export interface BookingPageSettings {
  bookingUrl?: string;
  bookingEnabled?: boolean;
  // Read compatibility for saved questions. New settings never write these fields.
  calHost?: string;
  calUserName?: string;
}

export function getBookingPageUrl(settings: BookingPageSettings): string | undefined {
  if (settings.bookingUrl !== undefined) return parseBookingPageUrl(settings.bookingUrl);
  const direct = parseBookingPageUrl(settings.calUserName);
  if (direct) return direct;
  if (!settings.calHost) return undefined;
  const origin = parseBookingPageUrl(
    settings.calHost.includes("://") ? settings.calHost : `https://${settings.calHost}`
  );
  if (!origin) return undefined;
  return parseBookingPageUrl(`${origin.replace(/\/$/, "")}/${settings.calUserName ?? ""}`);
}

export const isBookingPageEnabled = (settings: BookingPageSettings): boolean =>
  settings.bookingEnabled ?? Boolean(getBookingPageUrl(settings));
