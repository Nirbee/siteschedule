import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";

export const metadata: Metadata = { title: "Новости" };

export default function NewsPage() {
  return (
    <>
      <PageHeader title="Новости" />
      <StagePlaceholder stage="M6">Сообщения от старост с закрепом важного.</StagePlaceholder>
    </>
  );
}
