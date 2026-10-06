// One-sentence description of a schedule change: the «Так увидят однокурсники» preview,
// the change history and (from M6) the Telegram message.
import type { IsoDate } from "./dates";
import { KIND_LABELS, formatRoom, fromDay, onDay, toDay } from "./format";
import type { ChangeInfo, LessonKind, ScheduleData, TimeRange } from "./types";

export type ChangeDescription =
  | { type: "cancel"; subject: string; date: IsoDate; time: TimeRange }
  | {
      type: "replace";
      subject: string;
      newSubject: string;
      date: IsoDate;
      time: TimeRange;
      newRoom?: string | null;
    }
  | {
      type: "room";
      subject: string;
      date: IsoDate;
      time: TimeRange;
      oldRoom: string | null;
      newRoom: string;
    }
  | {
      type: "move";
      subject: string;
      date: IsoDate;
      time: TimeRange;
      newDate: IsoDate;
      newTime: TimeRange;
      newRoom?: string | null;
    }
  | {
      type: "add";
      newSubject: string;
      kind: LessonKind;
      date: IsoDate;
      time: TimeRange;
      newRoom?: string | null;
    };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const roomSuffix = (room: string | null | undefined) => (room ? `, ${formatRoom(room)}` : "");

export function describeChange(change: ChangeDescription): string {
  switch (change.type) {
    case "cancel":
      return `Пара «${change.subject}» ${onDay(change.date)}, в ${change.time.start} отменена.`;
    case "replace":
      return `${capitalize(onDay(change.date))}, в ${change.time.start} вместо «${change.subject}» — «${change.newSubject}»${roomSuffix(change.newRoom)}.`;
    case "room":
      return `Пара «${change.subject}» ${onDay(change.date)}, в ${change.time.start} пройдёт в ${formatRoom(change.newRoom)}${change.oldRoom ? ` вместо ${change.oldRoom}` : ""}.`;
    case "move":
      if (change.newDate === change.date) {
        return `Пара «${change.subject}» ${onDay(change.date)} переносится с ${change.time.start} на ${change.newTime.start}${roomSuffix(change.newRoom)}.`;
      }
      return `Пара «${change.subject}» переносится ${fromDay(change.date)}, ${change.time.start} ${toDay(change.newDate)}, ${change.newTime.start}${roomSuffix(change.newRoom)}.`;
    case "add":
      return `Дополнительная пара: «${change.newSubject}» (${KIND_LABELS[change.kind].toLowerCase()}) ${onDay(change.date)}, ${change.time.start}–${change.time.end}${roomSuffix(change.newRoom)}.`;
  }
}

/** Builds the description of a stored change from the loaded schedule. */
export function describeStoredChange(
  data: ScheduleData,
  change: ChangeInfo,
): ChangeDescription | null {
  const subjectName = (id: string | null) => (id ? data.subjects.get(id)?.name : undefined);
  const timeOf = (slotN: number | null, start: string | null, end: string | null) =>
    slotN !== null ? data.slots.get(slotN) : start && end ? { start, end } : undefined;

  if (change.type === "add") {
    const newSubject = subjectName(change.newSubjectId);
    const time = timeOf(change.slotN, change.startsAt, change.endsAt);
    if (!newSubject || !time) return null;
    return {
      type: "add",
      newSubject,
      kind: change.newKind ?? "lecture",
      date: change.date,
      time,
      newRoom: change.newRoom,
    };
  }

  const entry = data.entries.find((e) => e.id === change.entryId);
  const subject = entry && subjectName(entry.subjectId);
  const time = entry && data.slots.get(entry.slotN);
  if (!entry || !subject || !time) return null;

  switch (change.type) {
    case "cancel":
      return { type: "cancel", subject, date: change.date, time };
    case "replace": {
      const newSubject = subjectName(change.newSubjectId);
      return newSubject
        ? { type: "replace", subject, newSubject, date: change.date, time, newRoom: change.newRoom }
        : null;
    }
    case "room":
      return change.newRoom
        ? {
            type: "room",
            subject,
            date: change.date,
            time,
            oldRoom: entry.room,
            newRoom: change.newRoom,
          }
        : null;
    case "move": {
      const newTime = timeOf(change.newSlotN, change.newStartsAt, change.newEndsAt);
      return change.newDate && newTime
        ? {
            type: "move",
            subject,
            date: change.date,
            time,
            newDate: change.newDate,
            newTime,
            newRoom: change.newRoom,
          }
        : null;
    }
  }
}
