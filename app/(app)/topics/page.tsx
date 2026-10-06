import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Темы" };

export default function TopicsPage() {
  return (
    <>
      <PageHeader title="Темы" />
      <ComingSoon>Здесь можно будет выбрать тему доклада и посмотреть очередь сдачи.</ComingSoon>
    </>
  );
}
