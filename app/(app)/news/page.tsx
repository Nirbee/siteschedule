import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Новости" };

export default function NewsPage() {
  return (
    <>
      <PageHeader title="Новости" />
      <ComingSoon>Здесь будут объявления от старост.</ComingSoon>
    </>
  );
}
