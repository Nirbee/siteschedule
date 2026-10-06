// Calendar dates as "YYYY-MM-DD" strings (Moscow calendar). Arithmetic is done in UTC
// on purpose: a calendar date has no time zone, so no DST/offset surprises.
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { TIME_ZONE } from "@/lib/time";

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = toUtc(value);
  return !Number.isNaN(date.getTime()) && fromUtc(date) === value;
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

/** Today's date in Moscow. */
export function todayInMoscow(now: Date = new Date()): IsoDate {
  return format(new TZDate(now.getTime(), TIME_ZONE), "yyyy-MM-dd");
}

/** The instant a Moscow calendar date + "HH:mm" time happens. */
export function moscowInstant(date: IsoDate, time: string): Date {
  return new TZDate(`${date}T${time}:00`, TIME_ZONE);
}

/** "17:35:00" (Postgres time) → "17:35". */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}
