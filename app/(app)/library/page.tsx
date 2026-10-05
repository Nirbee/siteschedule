import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";

export const metadata: Metadata = { title: "Конспекты" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Конспекты" />
      <StagePlaceholder stage="M4">Фото с пар и материалы по каждой дисциплине.</StagePlaceholder>
    </>
  );
}
