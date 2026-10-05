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
