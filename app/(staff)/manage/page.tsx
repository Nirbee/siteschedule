import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";

export const metadata: Metadata = { title: "Панель старосты" };

export default function ManagePage() {
  return (
    <>
      <PageHeader title="Панель старосты" />
      <StagePlaceholder stage="M2">
        Изменения расписания, базовое расписание, «Неразобранное», новости, темы и рубежки.
      </StagePlaceholder>
    </>
  );
}
