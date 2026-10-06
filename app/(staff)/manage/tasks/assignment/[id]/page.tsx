import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { getAssignment } from "@/lib/services/tasks";
import { AssignmentForm } from "../../assignment-form";
import { toChosen } from "../../chosen";
import { loadTaskFormData } from "../../form-data";

export const metadata: Metadata = { title: "Изменить задание" };

export default async function EditAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ user }, { id }] = await Promise.all([requireRole("starosta", "admin"), params]);
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getAssignment(id) : undefined;
  if (!item) notFound();
  const options = await loadTaskFormData(user.groupId!);
  if (!options) return <p className="text-muted">Сначала задайте семестр в базовом расписании.</p>;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Режим старосты" title="Изменить задание" />
      <AssignmentForm
        options={options}
        initial={{ ...item, materials: toChosen(item.materials) }}
      />
    </div>
  );
}
