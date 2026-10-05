import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";

export const metadata: Metadata = { title: "Темы" };

export default function TopicsPage() {
  return (
    <>
      <PageHeader title="Темы" />
      <StagePlaceholder stage="M7">
        Списки тем по дисциплинам, выбор темы и очередь сдачи.
      </StagePlaceholder>
    </>
  );
}
