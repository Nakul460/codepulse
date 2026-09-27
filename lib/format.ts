/**
 * Shared display formatters.
 *
 * Locale is pinned to a single constant rather than read from
 * `navigator.language` at render time: these values are rendered on the server
 * and hydrated on the client, and a locale that differs between the two
 * produces a hydration mismatch. Switching to a user-chosen locale needs a
 * locale-aware root that passes the resolved locale through context first.
 */
export const APP_LOCALE = "en-US";

const currencyFormatter = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const shortDateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
});

const relativeFormatter = new Intl.RelativeTimeFormat(APP_LOCALE, {
  numeric: "auto",
});

export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(value ?? 0);
}

export function formatShortDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : shortDateFormatter.format(date);
}

export function formatLongDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : longDateFormatter.format(date);
}

export function formatDateTime(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

/**
 * Compact relative time ("3 days ago"). Computed against an explicit `now` so
 * the value is stable for a render pass instead of drifting on every render.
 */
export function formatRelativeTime(iso: string, now: number) {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relativeFormatter.format(-Math.round(seconds / size), unit);
    }
  }

  return "just now";
}
