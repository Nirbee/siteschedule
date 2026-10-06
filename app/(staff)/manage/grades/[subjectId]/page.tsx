import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { displayName } from "@/components/library/format";
import { getScheme } from "@/lib/services/grades";
import { getSubject } from "@/lib/services/library";
import { materialOptions } from "@/lib/services/tasks";
import { listTeachers } from "@/lib/services/teachers";
import { deleteSchemeAction } from "../actions";
import { SchemeEditor } from "./scheme-editor";

export const metadata: Metadata = { title: "Система баллов" };

export default async function SchemePage({ params }: { params: Promise<{ subjectId: string }> }) {
  const [, { subjectId }] = await Promise.all([requireRole("starosta", "admin"), params]);
  const subject = /^[0-9a-f-]{36}$/.test(subjectId) ? await getSubject(subjectId) : undefined;
  if (!subject) notFound();
  const [config, teachers, materials] = await Promise.all([
    getScheme(subject.id),
    listTeachers(),
    materialOptions(),
  ]);
  const files = (materials[subject.id] ?? [])
    .filter((o) => o.kind === "file")
    .map((o) => ({
      id: o.value.slice(2),
      name: displayName({ title: o.title, fileName: o.fileName ?? "" }),
    }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader eyebrow="Система баллов" title={subject.name} />
      <SchemeEditor
        subjectId={subject.id}
        initial={config}
        teachers={teachers.map((t) => ({ id: t.id, name: t.fullName }))}
        files={files}
      />
      {config ? (
        <form action={deleteSchemeAction}>
          <input type="hidden" name="subjectId" value={subject.id} />
          <ConfirmSubmit message="Убрать систему баллов? Отметки студентов сохранятся, но не будут видны.">
            Убрать систему баллов
          </ConfirmSubmit>
        </form>
      ) : null}
    </div>
  );
}
