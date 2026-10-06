import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { addDays, todayInMoscow } from "@/lib/schedule/dates";
import { listTimeSlots } from "@/lib/services/schedule-admin";
import { listGroups } from "@/lib/services/members";
import { changeableLessons, loadScheduleData } from "@/lib/services/schedule";
import { ChangeForm, type LessonOption } from "./change-form";

export const metadata: Metadata = { title: "Изменение в расписании" };

export default async function NewChangePage() {
  const { user } = await requireRole("starosta", "admin");
  const [data, slots, groups] = await Promise.all([
    loadScheduleData(),
    listTimeSlots(),
    listGroups({ enabledOnly: true }),
  ]);
  if (!data) return <p className="text-muted">Сначала задайте семестр в базовом расписании.</p>;

  const today = todayInMoscow();
  const lessons: LessonOption[] = changeableLessons(data, user.groupId!, today).map((l) => ({
    key: `${l.entryId}|${l.date}`,
    entryId: l.entryId,
    date: l.date,
    slotN: l.slotN,
    time: l.time,
    subjectName: l.status === "replaced" && l.original ? l.original.subjectName : l.subject.name,
    kind: l.status === "replaced" && l.original ? l.original.kind : l.kind,
    room: l.original?.room ?? l.room,
    changed: l.status !== "normal",
    groupIds: l.groupIds,
  }));
  const subjects = [...data.subjects.values()]
    .filter((s) => s.name !== "Самостоятельная работа")
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Режим старосты" title="Изменение в расписании" />
      <ChangeForm
        lessons={lessons}
        subjects={subjects}
        slots={slots}
        groups={groups.map((g) => ({ id: g.id, code: g.code }))}
        today={today}
        lastDate={
          data.semester.endsOn < addDays(today, 365) ? data.semester.endsOn : addDays(today, 365)
        }
      />
    </div>
  );
}
