// «Какие пары в этот день»: base schedule + date-specific changes. Pure functions over
// preloaded data — see docs/DATA_MODEL.md «resolveDay».
import { addDays, isoWeekday, type IsoDate } from "./dates";
import type {
  ChangeInfo,
  EntryInfo,
  LessonPlace,
  ResolvedLesson,
  ScheduleData,
  TimeRange,
} from "./types";
import { weekInfo } from "./week";

/** Base entries of a group that take place on a date (parity, weekday, validity). */
export function baseEntriesOn(data: ScheduleData, date: IsoDate, groupId: string): EntryInfo[] {
  const week = weekInfo(data.semester, date);
  if (!week) return [];
  const weekday = isoWeekday(date);
  return data.entries.filter(
    (e) =>
      e.groupIds.includes(groupId) &&
      e.weekday === weekday &&
      (e.parity === "any" || e.parity === week.parity) &&
      (!e.validFrom || e.validFrom <= date) &&
      (!e.validTo || e.validTo >= date),
  );
}

/**
 * For every (entry, original date) the change that wins: the latest active one affecting the group.
 * `add` changes have no entry and never compete.
 */
function winningChanges(data: ScheduleData, groupId: string): Map<string, ChangeInfo> {
  const winners = new Map<string, ChangeInfo>();
  for (const change of data.changes) {
    if (change.revokedAt || !change.entryId || change.type === "add") continue;
    if (!change.groupIds.includes(groupId)) continue;
    const key = `${change.entryId}|${change.date}`;
    const current = winners.get(key);
    if (!current || change.createdAt > current.createdAt) winners.set(key, change);
  }
  return winners;
}

function slotTime(data: ScheduleData, slotN: number): TimeRange {
  const slot = data.slots.get(slotN);
  if (!slot) throw new Error(`Unknown time slot ${slotN}`);
  return slot;
}

function timeOf(
  data: ScheduleData,
  slotN: number | null,
  start: string | null,
  end: string | null,
): { slotN: number | null; time: TimeRange } {
  if (slotN !== null) return { slotN, time: slotTime(data, slotN) };
  if (start && end) return { slotN: null, time: { start, end } };
  throw new Error("Change has neither a slot nor a custom time");
}

function subjectRef(data: ScheduleData, subjectId: string) {
  const subject = data.subjects.get(subjectId);
  if (!subject) throw new Error(`Unknown subject ${subjectId}`);
  return { id: subject.id, name: subject.name, shortName: subject.shortName };
}

function lessonFromEntry(data: ScheduleData, entry: EntryInfo, date: IsoDate): ResolvedLesson {
  const subject = data.subjects.get(entry.subjectId);
  return {
    date,
    slotN: entry.slotN,
    time: slotTime(data, entry.slotN),
    subject: subjectRef(data, entry.subjectId),
    kind: entry.kind,
    room: entry.room,
    teacher: entry.teacher ?? subject?.teacher ?? null,
    status: "normal",
    entryId: entry.id,
  };
}

function withChange(lesson: ResolvedLesson, change: ChangeInfo): ResolvedLesson {
  return {
    ...lesson,
    changeId: change.id,
    ...(change.comment ? { comment: change.comment } : {}),
  };
}

function movedTarget(data: ScheduleData, change: ChangeInfo): LessonPlace {
  const { slotN, time } = timeOf(data, change.newSlotN, change.newStartsAt, change.newEndsAt);
  return { date: change.newDate!, slotN, time };
}

export function resolveDay(data: ScheduleData, date: IsoDate, groupId: string): ResolvedLesson[] {
  if (!weekInfo(data.semester, date)) return [];
  const winners = winningChanges(data, groupId);
  const lessons: ResolvedLesson[] = [];

  // Base lessons with their winning change applied.
  for (const entry of baseEntriesOn(data, date, groupId)) {
    const base = lessonFromEntry(data, entry, date);
    const change = winners.get(`${entry.id}|${date}`);
    if (!change) {
      lessons.push(base);
      continue;
    }
    const original = { subjectName: base.subject.name, kind: base.kind, room: base.room };
    switch (change.type) {
      case "cancel":
        lessons.push(withChange({ ...base, status: "cancelled" }, change));
        break;
      case "replace": {
        const subject = data.subjects.get(change.newSubjectId!);
        lessons.push(
          withChange(
            {
              ...base,
              status: "replaced",
              subject: subjectRef(data, change.newSubjectId!),
              kind: change.newKind ?? base.kind,
              room: change.newRoom ?? base.room,
              teacher: change.newTeacher ?? subject?.teacher ?? null,
              original,
            },
            change,
          ),
        );
        break;
      }
      case "room":
        lessons.push(
          withChange({ ...base, status: "room_changed", room: change.newRoom, original }, change),
        );
        break;
      case "move":
        lessons.push(
          withChange({ ...base, status: "moved_out", movedTo: movedTarget(data, change) }, change),
        );
        break;
    }
  }

  // Extra lessons added on this date.
  for (const change of data.changes) {
    if (change.revokedAt || change.type !== "add" || change.date !== date) continue;
    if (!change.groupIds.includes(groupId) || !change.newSubjectId) continue;
    const subject = data.subjects.get(change.newSubjectId);
    lessons.push({
      date,
      ...timeOf(data, change.slotN, change.startsAt, change.endsAt),
      subject: subjectRef(data, change.newSubjectId),
      kind: change.newKind ?? "lecture",
      room: change.newRoom,
      teacher: change.newTeacher ?? subject?.teacher ?? null,
      status: "added",
      changeId: change.id,
      ...(change.comment ? { comment: change.comment } : {}),
    });
  }

  // Lessons moved here from other dates (only if the move is still the winning change).
  for (const change of winners.values()) {
    if (change.type !== "move" || change.newDate !== date) continue;
    const entry = data.entries.find((e) => e.id === change.entryId);
    if (!entry || !baseEntriesOn(data, change.date, groupId).includes(entry)) continue;
    const origin = lessonFromEntry(data, entry, change.date);
    const target = movedTarget(data, change);
    lessons.push(
      withChange(
        {
          ...origin,
          date,
          slotN: target.slotN,
          time: target.time,
          room: change.newRoom ?? origin.room,
          status: "moved_in",
          movedFrom: { date: change.date, slotN: origin.slotN, time: origin.time },
        },
        change,
      ),
    );
  }

  lessons.sort(
    (a, b) => a.time.start.localeCompare(b.time.start) || (a.slotN ?? 99) - (b.slotN ?? 99),
  );
  markConflicts(lessons);
  return lessons;
}

/** Lessons that actually take place (for counts and conflicts). */
export function isHappening(lesson: ResolvedLesson): boolean {
  return lesson.status !== "cancelled" && lesson.status !== "moved_out";
}

function markConflicts(lessons: ResolvedLesson[]) {
  const real = lessons.filter((l) => isHappening(l) && l.kind !== "self_study");
  for (const a of real) {
    for (const b of real) {
      if (a !== b && a.time.start < b.time.end && b.time.start < a.time.end) {
        a.conflict = true;
        b.conflict = true;
      }
    }
  }
}

export interface ResolvedWeekDay {
  date: IsoDate;
  lessons: ResolvedLesson[];
}

/** Monday..Sunday of the week starting at `monday`. */
export function resolveWeek(
  data: ScheduleData,
  monday: IsoDate,
  groupId: string,
): ResolvedWeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, lessons: resolveDay(data, date, groupId) };
  });
}

export interface DaySummary {
  lessons: number; // real lessons, without self-study
  cancelled: number;
  changed: number; // replaced, room changed, moved in, added
  movedOut: number;
}

export function summarizeDay(lessons: ResolvedLesson[]): DaySummary {
  return {
    lessons: lessons.filter((l) => isHappening(l) && l.kind !== "self_study").length,
    cancelled: lessons.filter((l) => l.status === "cancelled").length,
    changed: lessons.filter((l) =>
      ["replaced", "room_changed", "moved_in", "added"].includes(l.status),
    ).length,
    movedOut: lessons.filter((l) => l.status === "moved_out").length,
  };
}
