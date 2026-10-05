import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
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
