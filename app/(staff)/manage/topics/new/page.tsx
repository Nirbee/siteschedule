import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { listSubjects } from "@/lib/services/schedule-admin";
import { ListFields } from "../list-fields";
import { NewListForm } from "./new-list-form";

export const metadata: Metadata = { title: "Новый список тем" };

export default async function NewTopicListPage() {
  await requireRole("starosta", "admin");
  const subjects = (await listSubjects()).filter((s) => s.name !== "Самостоятельная работа");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Режим старосты" title="Новый список тем" />
      <NewListForm>
        <ListFields subjects={subjects} />
      </NewListForm>
    </div>
  );
}
