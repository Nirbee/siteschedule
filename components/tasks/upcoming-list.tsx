import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { IsoDate } from "@/lib/schedule/dates";
import type { ControlEventView, PlacedAssignment } from "@/lib/services/tasks";
import { untilLabel } from "@/lib/tasks/place";
import { bodyLines } from "./format";

type Row = {
  id: string;
  href: Route;
  badge: string;
  strong: boolean;
  title: string;
  text: string;
  date: IsoDate;
};

/** «Скоро» on the Today page: nearest control events and unfinished homework. */
export function UpcomingList({
  today,
  assignments,
  controls,
}: {
  today: IsoDate;
  assignments: PlacedAssignment[];
  controls: ControlEventView[];
}) {
  const rows: Row[] = [
    ...controls.map((c) => ({
      id: c.id,
      href: `/tasks/control/${c.id}` as Route,
      badge: c.form,
      strong: true,
      title: c.subjectName,
      text: c.topics ? bodyLines(c.topics).slice(0, 2).join(" · ") : "",
      date: c.date,
    })),
    ...assignments.map((a) => ({
      id: a.id,
      href: `/tasks#a-${a.id}` as Route,
      badge: "Задание",
      strong: false,
      title: a.subjectName,
      text: bodyLines(a.body)[0] ?? "",
      date: a.due.date,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="upcoming" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="upcoming" className="eyebrow">
          Скоро
        </h2>
        <Link href="/tasks" className="inline-flex items-center gap-1 text-[14px] font-semibold">
          Все задания <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
        {rows.slice(0, 6).map((row) => (
          <li key={row.id} className="border-b border-line last:border-b-0">
            <Link
              href={row.href}
              className="flex min-h-[56px] items-center gap-3 px-[14px] py-2.5 text-ink no-underline hover:bg-surface-muted"
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`inline-block rounded-badge px-1.5 py-0.5 text-[12px] font-bold ${
                    row.strong ? "bg-emph text-on-emph" : "bg-chip text-ink-2"
                  }`}
                >
                  {row.badge}
                </span>
                <span className="mt-1 block truncate font-semibold">{row.title}</span>
                {row.text ? (
                  <span className="block truncate text-[14px] text-muted">{row.text}</span>
                ) : null}
              </span>
              <span className="shrink-0 self-start pt-0.5 font-mono text-[13px] text-ink-2">
                {untilLabel(today, row.date)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
