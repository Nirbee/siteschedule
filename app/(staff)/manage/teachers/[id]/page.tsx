import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { listSubjects } from "@/lib/services/schedule-admin";
import { listTeachers } from "@/lib/services/teachers";
import { deleteTeacherAction } from "../actions";
import { TeacherForm } from "../teacher-form";

export const metadata: Metadata = { title: "Преподаватель" };

/** /manage/teachers/new — a new teacher; /manage/teachers/<id> — editing. */
export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }] = await Promise.all([requireRole("starosta", "admin"), params]);
  const [teachers, subjectRows] = await Promise.all([listTeachers(), listSubjects()]);
  const subjects = subjectRows
    .filter((s) => s.name !== "Самостоятельная работа")
    .map((s) => ({ id: s.id, name: s.name }));
  const teacher = id === "new" ? undefined : teachers.find((t) => t.id === id);
  if (id !== "new" && !teacher) notFound();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader
        eyebrow="Режим старосты"
        title={teacher ? teacher.fullName : "Новый преподаватель"}
      />
      <TeacherForm
        subjects={subjects}
        initial={
          teacher ? { ...teacher, subjectIds: teacher.subjects.map((s) => s.id) } : undefined
        }
      />
      {teacher ? (
        <form action={deleteTeacherAction}>
          <input type="hidden" name="id" value={teacher.id} />
          <ConfirmSubmit message={`Удалить «${teacher.fullName}»?`}>Удалить</ConfirmSubmit>
        </form>
      ) : null}
    </div>
  );
}
