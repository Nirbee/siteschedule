import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";
import { ru } from "date-fns/locale";

/** All dates in the product are Moscow time. */
export const TIME_ZONE = "Europe/Moscow";

export function nowInMoscow(): TZDate {
  return new TZDate(Date.now(), TIME_ZONE);
}

/** «понедельник, 5 октября» */
export function formatLongDate(date: Date): string {
  return format(date, "EEEE, d MMMM", { locale: ru });
}

/** «сегодня», «вчера», «3 окт» — Moscow calendar days. */
export function formatRelativeDay(date: Date, now: Date = new Date()): string {
  const day = new TZDate(date.getTime(), TIME_ZONE);
  const today = new TZDate(now.getTime(), TIME_ZONE);
  const diff = differenceInCalendarDays(today, day);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "вчера";
  return format(day, day.getFullYear() === today.getFullYear() ? "d MMM" : "d MMM yyyy", {
    locale: ru,
  });
}

/** «9 октября, 20:00» in Moscow time. */
export function formatDateTime(date: Date): string {
  return format(new TZDate(date.getTime(), TIME_ZONE), "d MMMM, HH:mm", { locale: ru });
}

/** Value for <input type="datetime-local"> in Moscow time: «2026-10-06T20:00». */
export function toDateTimeInput(date: Date | null): string {
  return date ? format(new TZDate(date.getTime(), TIME_ZONE), "yyyy-MM-dd'T'HH:mm") : "";
}
