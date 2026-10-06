import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, Presentation as PresentationIcon } from "lucide-react";
import type { IsoDate } from "@/lib/schedule/dates";
import { formatRoom } from "@/lib/schedule/format";
import type { TimeRange } from "@/lib/schedule/types";
import type { ControlEventView } from "@/lib/services/tasks";
import type { Presentation } from "@/lib/services/topics";
import { controlTime } from "./format";

/** Big coloured notes on «Сегодня»: a control event or your presentation today / tomorrow. */
export function HeadsUp({
  today,
  tomorrow,
  controls,
  talks,
  slots,
}: {
  today: IsoDate;
  tomorrow: IsoDate;
  controls: ControlEventView[];
  talks: Presentation[];
  slots: Map<number, TimeRange>;
}) {
  const when = (date: IsoDate) => (date === today ? "Сегодня" : "Завтра");
  const exams = controls.filter((c) => c.date === today || c.date === tomorrow);
  const mine = talks.filter((t) => t.mine && (t.date === today || t.date === tomorrow));
  if (exams.length === 0 && mine.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {exams.map((c) => (
        <Link
          key={c.id}
          href={`/tasks/control/${c.id}` as Route}
          className="flex items-center gap-3 rounded-card border-2 border-exam bg-exam-bg p-[14px] text-exam no-underline md:p-[18px]"
        >
          <ClipboardCheck size={24} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-snug font-bold">
              {when(c.date)} — {c.form.toLowerCase()}: {c.subjectName}
            </span>
            <span className="block text-[14px] text-ink-2">
              {[controlTime(c, slots), formatRoom(c.room)].filter(Boolean).join(" · ")}
              {c.materials.length || c.topics ? " · что учить и материалы" : ""}
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0" aria-hidden />
        </Link>
      ))}
      {mine.map((t) => (
        <Link
          key={`${t.listId}-${t.n}`}
          href={`/topics/${t.listId}?tab=queue` as Route}
          className="flex items-center gap-3 rounded-card border-2 border-change bg-change-bg p-[14px] text-change no-underline md:p-[18px]"
        >
          <PresentationIcon size={24} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-snug font-bold">
              {when(t.date)} твой доклад{t.dueOrder ? ` (${t.dueOrder}-й)` : ""}
            </span>
            <span className="block text-[14px] text-ink-2">
              {t.n}. {t.title}
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0" aria-hidden />
        </Link>
      ))}
    </div>
  );
}
