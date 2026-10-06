// Which lesson an upload from the site goes to by default: the one happening now
// (or just ended), otherwise the latest past lesson of the last week.
import { addDays, type IsoDate } from "@/lib/schedule/dates";
import { isHappening, resolveDay } from "@/lib/schedule/resolve";
import type { LessonKind, ScheduleData, TimeRange } from "@/lib/schedule/types";

export const UPLOAD_LOOKBACK_DAYS = 7;
/** A lesson still counts as «now» this long after it ends (photos are often sent right after). */
const GRACE_MINUTES = 30;

export interface UploadLesson {
  key: string;
  subjectId: string;
  subjectName: string;
  date: IsoDate;
  slotN: number | null;
  time: TimeRange;
  kind: LessonKind;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function lessonKey(l: {
  subjectId: string;
  date: IsoDate;
  slotN: number | null;
  time: TimeRange;
}) {
  return `${l.subjectId}|${l.date}|${l.slotN ?? `@${l.time.start}`}`;
}

/** Lessons of the last week (newest first) that photos can be attached to, and the default one. */
export function uploadLessons(
  data: ScheduleData,
  groupId: string,
  today: IsoDate,
  nowTime: string, // "HH:mm", Moscow
): { lessons: UploadLesson[]; defaultKey: string | null } {
  const lessons: UploadLesson[] = [];
  for (let i = 0; i <= UPLOAD_LOOKBACK_DAYS; i++) {
    const date = addDays(today, -i);
    for (const l of resolveDay(data, date, groupId)) {
      if (!isHappening(l) || l.kind === "self_study") continue;
      if (date === today && minutes(l.time.start) > minutes(nowTime)) continue; // not started yet
      lessons.push({
        key: lessonKey({ subjectId: l.subject.id, date, slotN: l.slotN, time: l.time }),
        subjectId: l.subject.id,
        subjectName: l.subject.name,
        date,
        slotN: l.slotN,
        time: l.time,
        kind: l.kind,
      });
    }
  }
  lessons.sort((a, b) => (b.date + b.time.start).localeCompare(a.date + a.time.start));

  const now = minutes(nowTime);
  const current = lessons.find(
    (l) => l.date === today && now <= minutes(l.time.end) + GRACE_MINUTES,
  );
  return { lessons, defaultKey: (current ?? lessons[0])?.key ?? null };
}
