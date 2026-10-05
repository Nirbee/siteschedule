import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";

export const metadata: Metadata = { title: "Рубежки" };

export default function ExamsPage() {
  return (
    <>
      <PageHeader title="Рубежки" />
      <StagePlaceholder stage="M8">
        Рубежные контроли по датам с условиями допуска и отсчётом дней.
      </StagePlaceholder>
    </>
  );
}
