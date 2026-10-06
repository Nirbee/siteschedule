// Auto-sorting of photos/files from the Telegram chat (import and bot): by the time of the
// message (during a lesson → that lesson) and by the text (subject short names in the caption
// or file name). Pure functions — see docs/DATA_MODEL.md «Пайплайн приёма».
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { addDays, todayInMoscow, type IsoDate } from "@/lib/schedule/dates";
import { isHappening, resolveDay } from "@/lib/schedule/resolve";
import type { LessonKind, ScheduleData } from "@/lib/schedule/types";
import { TIME_ZONE } from "@/lib/time";

/** Photos sent this long after a lesson ends still belong to it. */
const GRACE_MINUTES = 30;
/** Messages of one author this close together form one batch (an album sent as several). */
const BATCH_GAP_MS = 2 * 60_000;

export interface SubjectNames {
  id: string;
  name: string;
  shortName: string | null;
  aliases: string[];
}

/** Lower case, ё → е, letters and digits only, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The one subject named in the text (short name, full name or alias), or null. */
export function textSubject(text: string, subjects: SubjectNames[]): string | null {
  const haystack = ` ${normalize(text)} `;
  if (haystack.trim() === "") return null;
  const found = new Set<string>();
  for (const s of subjects) {
    const keys = [s.shortName, s.name, ...s.aliases]
      .filter((k): k is string => Boolean(k))
      .map(normalize)
      .filter((k) => k.length >= 2);
    if (keys.some((k) => haystack.includes(` ${k} `))) found.add(s.id);
  }
  return found.size === 1 ? [...found][0]! : null;
}

export interface LessonRef {
  subjectId: string;
  subjectName: string;
  date: IsoDate;
  slotN: number | null;
  startsAt: string | null; // only for lessons outside the bell grid
  start: string;
  kind: LessonKind;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function moscowClock(at: Date): { date: IsoDate; time: string } {
  return {
    date: todayInMoscow(at),
    time: format(new TZDate(at.getTime(), TIME_ZONE), "HH:mm"),
  };
}

type DayLesson = LessonRef & { end: string };

const toRef = (l: DayLesson): LessonRef => ({
  subjectId: l.subjectId,
  subjectName: l.subjectName,
  date: l.date,
  slotN: l.slotN,
  startsAt: l.startsAt,
  start: l.start,
  kind: l.kind,
});

/** Lessons of the day for the given groups (shared lessons once). */
function dayLessons(data: ScheduleData, date: IsoDate, groupIds: string[]): DayLesson[] {
  const seen = new Map<string, DayLesson>();
  for (const groupId of groupIds) {
    for (const l of resolveDay(data, date, groupId)) {
      if (!isHappening(l) || l.kind === "self_study") continue;
      const lesson: DayLesson = {
        subjectId: l.subject.id,
        subjectName: l.subject.name,
        date,
        slotN: l.slotN,
        startsAt: l.slotN === null ? l.time.start : null,
        start: l.time.start,
        kind: l.kind,
        end: l.time.end,
      };
      seen.set(`${lesson.subjectId}|${lesson.slotN ?? lesson.start}`, lesson);
    }
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Lessons that took place on [from, to] for the given groups — choices when sorting by hand. */
export function lessonsBetween(
  data: ScheduleData,
  from: IsoDate,
  to: IsoDate,
  groupIds: string[],
): LessonRef[] {
  const result: LessonRef[] = [];
  for (let date = from; date <= to; date = addDays(date, 1))
    result.push(...dayLessons(data, date, groupIds).map(toRef));
  return result;
}

/** The lesson going on (or just over) when the message was sent. */
export function timeLesson(data: ScheduleData, at: Date, groupIds: string[]): LessonRef | null {
  const { date, time } = moscowClock(at);
  const now = minutes(time);
  const matching = dayLessons(data, date, groupIds).filter(
    (l) => minutes(l.start) <= now && now <= minutes(l.end) + GRACE_MINUTES,
  );
  // Right after one lesson and during the next: the later one wins.
  const lesson = matching[matching.length - 1];
  return lesson ? toRef(lesson) : null;
}

/** The last lesson that day before the message (a hint for photos sent later). */
export function lastLessonBefore(
  data: ScheduleData,
  at: Date,
  groupIds: string[],
): LessonRef | null {
  const { date, time } = moscowClock(at);
  const before = dayLessons(data, date, groupIds).filter((l) => minutes(l.start) <= minutes(time));
  const lesson = before[before.length - 1];
  return lesson ? toRef(lesson) : null;
}

export interface SortItem {
  kind: "photo" | "file";
  caption: string;
  fileName: string;
  postedAt: Date;
  authorId: number | null;
  mediaGroupId: string | null;
}

/** Indices grouped into batches: one album, or one author's messages ≤2 min apart. */
export function batches(items: SortItem[]): number[][] {
  const order = items.map((_, i) => i).sort((a, b) => +items[a]!.postedAt - +items[b]!.postedAt);
  const result: number[][] = [];
  for (const i of order) {
    const item = items[i]!;
    const last = result[result.length - 1];
    const prev = last ? items[last[last.length - 1]!]! : null;
    const sameAlbum = prev && item.mediaGroupId && prev.mediaGroupId === item.mediaGroupId;
    const sameAuthor =
      prev &&
      item.authorId !== null &&
      prev.authorId === item.authorId &&
      +item.postedAt - +prev.postedAt <= BATCH_GAP_MS;
    if (last && (sameAlbum || sameAuthor)) last.push(i);
    else result.push([i]);
  }
  return result;
}

export type Decision =
  | { status: "sorted"; lesson: LessonRef }
  | { status: "sorted"; materialsOf: string }
  | {
      status: "unsorted";
      suggestion: { subjectId: string | null; date: IsoDate | null; slotN: number | null };
      reason: string;
    };

export interface SortContext {
  data: ScheduleData;
  subjects: SubjectNames[];
  groupIds: string[];
}

const subjectName = (ctx: SortContext, id: string) =>
  ctx.subjects.find((s) => s.id === id)?.name ?? "";

/**
 * Decisions for every item of a batch. The batch's captions are one text signal; each item
 * adds its own file name. Photos go to the lesson at their time unless the text names another
 * subject; files need both signals to go to a lesson, or the text alone for «Материалы».
 */
export function decideBatch(items: SortItem[], ctx: SortContext): Decision[] {
  const captions = items.map((i) => i.caption).join(" ");
  return items.map((item) => {
    const text = textSubject(`${captions} ${item.fileName}`, ctx.subjects);
    const lesson = timeLesson(ctx.data, item.postedAt, ctx.groupIds);
    const hint = (reason: string, l: LessonRef | null, subjectId: string | null): Decision => ({
      status: "unsorted",
      suggestion: {
        subjectId: subjectId ?? l?.subjectId ?? null,
        date: l?.date ?? null,
        slotN: l?.slotN ?? null,
      },
      reason,
    });

    if (lesson && text && text !== lesson.subjectId) {
      return hint(
        `по времени — ${lesson.subjectName}, по подписи — ${subjectName(ctx, text)}`,
        lesson,
        null,
      );
    }
    if (item.kind === "photo") {
      if (lesson) return { status: "sorted", lesson };
      const earlier = lastLessonBefore(ctx.data, item.postedAt, ctx.groupIds);
      const sameSubject = earlier && (!text || text === earlier.subjectId) ? earlier : null;
      if (sameSubject) return hint("после пары", sameSubject, null);
      return text
        ? hint("по подписи", null, text)
        : hint("не во время пары и без подписи", null, null);
    }
    if (lesson && text === lesson.subjectId) return { status: "sorted", lesson };
    if (text && !lesson) return { status: "sorted", materialsOf: text };
    return lesson
      ? hint("во время пары, но без подписи", lesson, null)
      : hint("без подписи и не во время пары", null, null);
  });
}

/**
 * For topics where time means nothing (announcements): never sorted automatically; what the
 * robot would have done becomes the hint.
 */
export function forReview(decision: Decision): Decision {
  if (decision.status === "unsorted") return decision;
  if ("materialsOf" in decision)
    return {
      status: "unsorted",
      suggestion: { subjectId: decision.materialsOf, date: null, slotN: null },
      reason: "из топика объявлений, по подписи",
    };
  const l = decision.lesson;
  return {
    status: "unsorted",
    suggestion: { subjectId: l.subjectId, date: l.date, slotN: l.slotN },
    reason: "из топика объявлений, выложено во время пары",
  };
}
