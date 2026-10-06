// Where homework and control events show up in the schedule. Pure functions over ScheduleData,
// like lib/schedule/resolve.ts.
import { addDays, daysBetween, type IsoDate } from "@/lib/schedule/dates";
import { isHappening, resolveDay } from "@/lib/schedule/resolve";
import type { ResolvedLesson, ScheduleData } from "@/lib/schedule/types";

/** A due point: a lesson (bell-grid slot or custom start time) or just a date. */
export interface DuePlace {
  date: IsoDate;
  slotN: number | null;
  startsAt: string | null; // "HH:mm", only for lessons outside the bell grid
}

export interface PlacedDue extends DuePlace {
  /** The lesson was moved after the homework was given; the homework moved with it. */
  moved: boolean;
}

/** Whether a lesson is the one a due point refers to (a date-only due matches any lesson). */
export function matchesLesson(lesson: ResolvedLesson, subjectId: string, due: DuePlace): boolean {
  if (lesson.date !== due.date) return false;
  // A replaced lesson counts as the new subject's; a moved-out one keeps its subject.
  if (lesson.subject.id !== subjectId) return false;
  if (due.slotN !== null) return lesson.slotN === due.slotN;
  if (due.startsAt !== null) return lesson.slotN === null && lesson.time.start === due.startsAt;
  return true;
}

/** Follows a lesson move: homework «к паре 08.10» goes to the new date when that lesson moves. */
export function placeDue(
  data: ScheduleData,
  groupId: string,
  subjectId: string,
  due: DuePlace,
): PlacedDue {
  if (due.slotN === null && due.startsAt === null) return { ...due, moved: false };
  const lesson = resolveDay(data, due.date, groupId).find((l) => matchesLesson(l, subjectId, due));
  if (lesson?.status === "moved_out" && lesson.movedTo) {
    const target = lesson.movedTo;
    return {
      date: target.date,
      slotN: target.slotN,
      startsAt: target.slotN === null ? target.time.start : null,
      moved: true,
    };
  }
  return { ...due, moved: false };
}

/** Lessons of a subject that take place, from `from` (inclusive) for `days` days. */
export function subjectLessons(
  data: ScheduleData,
  groupId: string,
  subjectId: string,
  from: IsoDate,
  days = 42,
): ResolvedLesson[] {
  const result: ResolvedLesson[] = [];
  for (let i = 0; i < days; i++) {
    for (const lesson of resolveDay(data, addDays(from, i), groupId)) {
      if (lesson.subject.id === subjectId && isHappening(lesson) && lesson.kind !== "self_study")
        result.push(lesson);
    }
  }
  return result;
}

/** «К следующей паре»: the first lesson of the subject after today. */
export function nextLessonDue(
  data: ScheduleData,
  groupId: string,
  subjectId: string,
  today: IsoDate,
): DuePlace | null {
  const [lesson] = subjectLessons(data, groupId, subjectId, addDays(today, 1), 63);
  return lesson ? lessonDue(lesson) : null;
}

export function lessonDue(lesson: ResolvedLesson): DuePlace {
  return {
    date: lesson.date,
    slotN: lesson.slotN,
    startsAt: lesson.slotN === null ? lesson.time.start : null,
  };
}

/**
 * Splits a day's items between its lesson cards: each item goes to the first matching lesson
 * that takes place; items with no such lesson stay at day level.
 */
export function attachToLessons<T extends { subjectId: string; due: DuePlace }>(
  lessons: ResolvedLesson[],
  items: T[],
): { byLesson: Map<number, T[]>; dayLevel: T[] } {
  const byLesson = new Map<number, T[]>();
  const dayLevel: T[] = [];
  for (const item of items) {
    const index = lessons.findIndex(
      (l) => isHappening(l) && matchesLesson(l, item.subjectId, item.due),
    );
    if (index === -1) dayLevel.push(item);
    else byLesson.set(index, [...(byLesson.get(index) ?? []), item]);
  }
  return { byLesson, dayLevel };
}

/** «сегодня», «завтра», «через 3 дня», «вчера», «5 дней назад». */
export function untilLabel(today: IsoDate, date: IsoDate): string {
  const days = daysBetween(today, date);
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  const n = Math.abs(days);
  const word =
    n % 10 === 1 && n % 100 !== 11
      ? "день"
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
        ? "дня"
        : "дней";
  return days > 0 ? `через ${n} ${word}` : `${n} ${word} назад`;
}

interface ControlLike {
  subjectId: string;
  date: IsoDate;
  slotN: number | null;
  startsAt: string | null;
}

export interface DayTasks<A, C> {
  byLesson: Map<number, { assignments: A[]; controls: C[] }>;
  dayLevel: { assignments: A[]; controls: C[] };
}

/** A day's homework and control events, split between its lesson cards and the day itself. */
export function tasksOfDay<A extends { subjectId: string; due: DuePlace }, C extends ControlLike>(
  lessons: ResolvedLesson[],
  date: IsoDate,
  assignments: A[],
  controls: C[],
): DayTasks<A, C> {
  const homework = attachToLessons(
    lessons,
    assignments.filter((a) => a.due.date === date),
  );
  const exams = attachToLessons(
    lessons,
    controls
      .filter((c) => c.date === date)
      .map((c) => ({
        subjectId: c.subjectId,
        due: { date: c.date, slotN: c.slotN, startsAt: c.slotN === null ? c.startsAt : null },
        control: c,
      })),
  );
  const byLesson = new Map<number, { assignments: A[]; controls: C[] }>();
  const slot = (i: number) => {
    const entry = byLesson.get(i) ?? { assignments: [], controls: [] };
    byLesson.set(i, entry);
    return entry;
  };
  for (const [i, list] of homework.byLesson) slot(i).assignments.push(...list);
  for (const [i, list] of exams.byLesson) slot(i).controls.push(...list.map((x) => x.control));
  return {
    byLesson,
    dayLevel: { assignments: homework.dayLevel, controls: exams.dayLevel.map((x) => x.control) },
  };
}
