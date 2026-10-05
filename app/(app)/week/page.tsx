import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";

export const metadata: Metadata = { title: "Расписание" };

export default function WeekPage() {
  return (
    <>
      <PageHeader title="Расписание" />
      <StagePlaceholder stage="M2">
        Сетка недели с навигацией и всеми изменениями, экспорт в календарь.
      </StagePlaceholder>
    </>
  );
}
