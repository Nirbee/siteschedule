// Options for the homework and control-event forms (server side).
import { todayInMoscow } from "@/lib/schedule/dates";
import { KIND_LABELS, shortDate } from "@/lib/schedule/format";
import { getUploadOptions } from "@/lib/services/library";
import { listTimeSlots } from "@/lib/services/schedule-admin";
import { loadScheduleData } from "@/lib/services/schedule";
import { materialOptions } from "@/lib/services/tasks";
import { lessonDue, nextLessonDue, subjectLessons } from "@/lib/tasks/place";
import type { LessonOption, TaskFormOptions } from "./form-types";

/** Everything the forms need: subjects, their upcoming lessons, library files, bell grid. */
export async function loadTaskFormData(groupId: string): Promise<TaskFormOptions | null> {
  const [data, slots, materials, upload] = await Promise.all([
    loadScheduleData(),
    listTimeSlots(),
    materialOptions(),
    getUploadOptions(groupId),
  ]);
  if (!data) return null;
  const today = todayInMoscow();
  const subjects = [...data.subjects.values()]
    .filter((s) => s.name !== "Самостоятельная работа")
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const lessons: Record<string, LessonOption[]> = {};
  const nextDue: Record<string, string | null> = {};
  for (const subject of subjects) {
    lessons[subject.id] = subjectLessons(data, groupId, subject.id, today, 63).map((l) => {
      const due = lessonDue(l);
      return {
        value: `${due.date}|${due.slotN ?? ""}|${due.startsAt ?? ""}`,
        date: due.date,
        slotN: due.slotN,
        startsAt: due.startsAt,
        start: l.time.start,
        end: l.time.end,
        label: `${shortDate(l.date)} · ${l.slotN !== null ? `${l.slotN} пара · ` : ""}${
          l.time.start
        } · ${KIND_LABELS[l.kind]}`,
      };
    });
    const next = nextLessonDue(data, groupId, subject.id, today);
    nextDue[subject.id] = next ? `${next.date}|${next.slotN ?? ""}|${next.startsAt ?? ""}` : null;
  }

  return {
    subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
    lessons,
    nextDue,
    materials,
    slots,
    today,
    lastDate: data.semester.endsOn,
    upload,
  };
}
