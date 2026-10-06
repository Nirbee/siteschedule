import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Рубежки" };

export default function ExamsPage() {
  return (
    <>
      <PageHeader title="Рубежки" />
      <ComingSoon>Здесь будут все рубежные контроли: даты, аудитории и условия допуска.</ComingSoon>
    </>
  );
}
