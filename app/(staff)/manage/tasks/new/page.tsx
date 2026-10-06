import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { AssignmentForm } from "../assignment-form";
import { ControlForm } from "../control-form";
import { loadTaskFormData } from "../form-data";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}): Promise<Metadata> {
  return { title: (await searchParams).type === "control" ? "Новая контрольная" : "Новое задание" };
}

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; subject?: string }>;
}) {
  const [{ user }, search] = await Promise.all([requireRole("starosta", "admin"), searchParams]);
  const options = await loadTaskFormData(user.groupId!);
  if (!options) return <p className="text-muted">Сначала задайте семестр в базовом расписании.</p>;

  const control = search.type === "control";
  const subject = options.subjects.some((s) => s.id === search.subject)
    ? search.subject
    : undefined;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="Режим старосты"
        title={control ? "Новая контрольная" : "Новое задание"}
      />
      {control ? (
        <ControlForm options={options} defaultSubjectId={subject} />
      ) : (
        <AssignmentForm options={options} defaultSubjectId={subject} />
      )}
    </div>
  );
}
