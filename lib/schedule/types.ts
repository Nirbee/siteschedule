import type { IsoDate } from "./dates";

export type LessonKind = "lecture" | "seminar" | "practice" | "lab" | "self_study";
export type Parity = "any" | "numerator" | "denominator";
export type ChangeType = "cancel" | "replace" | "move" | "add" | "room";
export type LessonStatus =
  "normal" | "cancelled" | "replaced" | "room_changed" | "moved_out" | "moved_in" | "added";

export interface TimeRange {
  start: string; // "HH:mm"
  end: string;
}

export interface SemesterInfo {
  startsOn: IsoDate; // Monday of week 1
  endsOn: IsoDate;
  firstWeekParity: Exclude<Parity, "any">;
}

export interface SubjectInfo {
  id: string;
  name: string;
  shortName: string | null;
  teacher: string | null;
}

export interface EntryInfo {
  id: string;
  subjectId: string;
  weekday: number;
  slotN: number;
  parity: Parity;
  kind: LessonKind;
  room: string | null;
  teacher: string | null;
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
  groupIds: string[];
}

export interface ChangeInfo {
  id: string;
  type: ChangeType;
  date: IsoDate;
  entryId: string | null;
  slotN: number | null;
  startsAt: string | null;
  endsAt: string | null;
  newSubjectId: string | null;
  newKind: LessonKind | null;
  newRoom: string | null;
  newTeacher: string | null;
  newDate: IsoDate | null;
  newSlotN: number | null;
  newStartsAt: string | null;
  newEndsAt: string | null;
  comment: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  groupIds: string[];
}

/** Everything resolveDay needs, loaded once (see lib/services/schedule.ts). */
export interface ScheduleData {
  semester: SemesterInfo;
  slots: Map<number, TimeRange>;
  subjects: Map<string, SubjectInfo>;
  entries: EntryInfo[];
  changes: ChangeInfo[];
}

export interface LessonPlace {
  date: IsoDate;
  slotN: number | null;
  time: TimeRange;
}

export interface ResolvedLesson {
  date: IsoDate;
  slotN: number | null; // null — «другое время»
  time: TimeRange;
  subject: { id: string; name: string; shortName: string | null };
  kind: LessonKind;
  room: string | null;
  teacher: string | null;
  status: LessonStatus;
  original?: { subjectName: string; kind: LessonKind; room: string | null };
  movedTo?: LessonPlace;
  movedFrom?: LessonPlace;
  comment?: string;
  changeId?: string;
  entryId?: string;
  conflict?: boolean;
}
