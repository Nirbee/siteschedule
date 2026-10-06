import type { UploadLessonOption } from "@/components/library/upload-sheet";
import type { IsoDate } from "@/lib/schedule/dates";
import type { MaterialOption } from "@/lib/services/tasks";
import type { MaterialInput } from "@/lib/tasks/inputs";

export interface LessonOption {
  value: string; // "date|slotN|startsAt"
  date: IsoDate;
  slotN: number | null;
  startsAt: string | null;
  start: string;
  end: string;
  label: string;
}

export interface TaskFormOptions {
  subjects: { id: string; name: string }[];
  /** Upcoming lessons per subject (from today). */
  lessons: Record<string, LessonOption[]>;
  /** «К следующей паре» per subject: value of a lesson option. */
  nextDue: Record<string, string | null>;
  materials: Record<string, MaterialOption[]>;
  slots: { n: number; start: string; end: string }[];
  today: IsoDate;
  lastDate: IsoDate;
  upload: {
    lessons: UploadLessonOption[];
    subjects: { id: string; name: string }[];
    defaultLessonKey: string | null;
  };
}

/** A chosen material with the text shown in the picker. */
export interface ChosenMaterial {
  key: string;
  input: MaterialInput;
  label: string;
  pageCount: number | null;
}
