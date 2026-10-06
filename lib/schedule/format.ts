// Russian labels for the schedule UI and messages.
import { isoWeekday, type IsoDate } from "./dates";
import type { ChangeType, LessonKind, TimeRange } from "./types";

export const KIND_LABELS: Record<LessonKind, string> = {
  lecture: "Лекция",
  seminar: "Семинар",
  practice: "Практика",
  lab: "Лабораторная",
  self_study: "Самостоятельная работа",
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  cancel: "Отмена",
  replace: "Замена",
  move: "Перенос",
  add: "Доп. пара",
  room: "Аудитория",
};

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const DAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const DAY_NOMINATIVE = [
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
  "воскресенье",
];
const DAY_ACCUSATIVE = [
  "понедельник",
  "вторник",
  "среду",
  "четверг",
  "пятницу",
  "субботу",
  "воскресенье",
];
const DAY_GENITIVE = [
  "понедельника",
  "вторника",
  "среды",
  "четверга",
  "пятницы",
  "субботы",
  "воскресенья",
];

const day = (date: IsoDate) => isoWeekday(date) - 1;

function parts(date: IsoDate) {
  const [, m, d] = date.split("-");
  return { month: Number(m), day: Number(d), dd: d!, mm: m! };
}

/** «пн» */
export const shortWeekday = (date: IsoDate) => DAY_SHORT[day(date)]!;
/** «понедельник» */
export const weekdayName = (date: IsoDate) => DAY_NOMINATIVE[day(date)]!;
/** «5 октября» */
export function dayMonth(date: IsoDate): string {
  const { day: d, month } = parts(date);
  return `${d} ${MONTHS_GENITIVE[month - 1]}`;
}
/** «сб, 10.10» */
export function shortDate(date: IsoDate): string {
  const { dd, mm } = parts(date);
  return `${shortWeekday(date)}, ${dd}.${mm}`;
}
/** «в среду, 7 октября» / «во вторник, 6 октября» */
export function onDay(date: IsoDate): string {
  const prep = day(date) === 1 ? "во" : "в";
  return `${prep} ${DAY_ACCUSATIVE[day(date)]}, ${dayMonth(date)}`;
}
/** «со среды, 7 октября» / «с понедельника, 5 октября» */
export function fromDay(date: IsoDate): string {
  const prep = day(date) === 1 || day(date) === 2 ? "со" : "с";
  return `${prep} ${DAY_GENITIVE[day(date)]}, ${dayMonth(date)}`;
}
/** «на субботу, 10 октября» */
export function toDay(date: IsoDate): string {
  return `на ${DAY_ACCUSATIVE[day(date)]}, ${dayMonth(date)}`;
}
/** «со ср, 07.10» / «с пн, 05.10» */
export function fromShortDate(date: IsoDate): string {
  const prep = day(date) === 1 || day(date) === 2 ? "со" : "с";
  return `${prep} ${shortDate(date)}`;
}

/** «514» → «ауд. 514»; «каф. ИУ8» stays as is. */
export function formatRoom(room: string | null): string | null {
  if (!room) return null;
  return /^\d/.test(room) ? `ауд. ${room}` : room;
}

export const formatTimeRange = (time: TimeRange) => `${time.start}–${time.end}`;

/** «3 пары», «1 пара», «5 пар» */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export type DayFlagTone = "move" | "add" | "cancel" | "change";

/** Short note for a day tile: «перенос → сб», «+ Аудит ИБ», «отмена», «замена». */
export function dayFlag(
  lessons: {
    status: string;
    subject: { name: string; shortName: string | null };
    movedTo?: { date: IsoDate };
  }[],
): { text: string; tone: DayFlagTone } | null {
  const movedOut = lessons.find((l) => l.status === "moved_out");
  if (movedOut?.movedTo) {
    return { text: `перенос → ${shortWeekday(movedOut.movedTo.date)}`, tone: "move" };
  }
  const extra = lessons.find((l) => l.status === "added" || l.status === "moved_in");
  if (extra) {
    return {
      text: `+ ${extra.subject.shortName ?? extra.subject.name}`,
      tone: extra.status === "added" ? "add" : "move",
    };
  }
  if (lessons.some((l) => l.status === "cancelled")) return { text: "отмена", tone: "cancel" };
  if (lessons.some((l) => l.status === "replaced")) return { text: "замена", tone: "change" };
  if (lessons.some((l) => l.status === "room_changed"))
    return { text: "аудитория", tone: "change" };
  return null;
}
