import { daysBetween, mondayOf, type IsoDate } from "./dates";
import type { Parity, SemesterInfo } from "./types";

export interface WeekInfo {
  number: number; // «6 неделя»
  parity: Exclude<Parity, "any">;
}

/** Week number and numerator/denominator for a date; null outside the semester. */
export function weekInfo(semester: SemesterInfo, date: IsoDate): WeekInfo | null {
  if (date < semester.startsOn || date > semester.endsOn) return null;
  const weekIndex = Math.floor(daysBetween(semester.startsOn, mondayOf(date)) / 7);
  const other = semester.firstWeekParity === "numerator" ? "denominator" : "numerator";
  return { number: weekIndex + 1, parity: weekIndex % 2 === 0 ? semester.firstWeekParity : other };
}

export const PARITY_LABELS = {
  any: "каждую неделю",
  numerator: "числитель",
  denominator: "знаменатель",
} as const;
