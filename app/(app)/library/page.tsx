import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Конспекты" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader title="Конспекты" />
      <ComingSoon>
        Здесь будут фото с пар и материалы преподавателей по каждой дисциплине.
      </ComingSoon>
    </>
  );
}
