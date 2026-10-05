import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";
import { formatLongDate, nowInMoscow } from "@/lib/time";

export default function TodayPage() {
  const today = formatLongDate(nowInMoscow());

  return (
    <>
      <PageHeader eyebrow="Сегодня" title={today[0]!.toUpperCase() + today.slice(1)} />
      <StagePlaceholder stage="M2">
        Здесь будут пары на сегодня с отменами, заменами и переносами, лента недели, новости и
        ближайшие рубежки.
      </StagePlaceholder>
    </>
  );
}
