import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { getControlEvent } from "@/lib/services/tasks";
import { toChosen } from "../../chosen";
import { ControlForm } from "../../control-form";
import { loadTaskFormData } from "../../form-data";

export const metadata: Metadata = { title: "Изменить контрольную" };

export default async function EditControlEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ user }, { id }] = await Promise.all([requireRole("starosta", "admin"), params]);
  const event = /^[0-9a-f-]{36}$/.test(id) ? await getControlEvent(id) : undefined;
  if (!event) notFound();
  const options = await loadTaskFormData(user.groupId!);
  if (!options) return <p className="text-muted">Сначала задайте семестр в базовом расписании.</p>;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Режим старосты" title="Изменить контрольную" />
      <ControlForm options={options} initial={{ ...event, materials: toChosen(event.materials) }} />
    </div>
  );
}
