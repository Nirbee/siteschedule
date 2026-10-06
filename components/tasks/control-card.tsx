import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, Paperclip } from "lucide-react";
import { formatRoom, plural } from "@/lib/schedule/format";
import type { ControlEventView } from "@/lib/services/tasks";
import { bodyLines } from "./format";

/** Control event summary; the whole card opens its page with details and materials. */
export function ControlCard({
  event,
  when,
  showSubject = true,
  flat = false,
}: {
  event: ControlEventView;
  /** «2 пара · 10:10–11:40» or a full date and time. */
  when: string;
  showSubject?: boolean;
  /** Inside a lesson card. */
  flat?: boolean;
}) {
  const topics = event.topics ? bodyLines(event.topics) : [];
  return (
    <Link
      href={`/tasks/control/${event.id}` as Route}
      className={`flex items-center gap-3 text-ink no-underline ${
        flat
          ? "rounded-[12px] bg-surface-muted px-3 py-2.5 hover:bg-chip"
          : "rounded-card border-2 border-emph bg-surface p-[14px] hover:bg-surface-muted md:p-[18px]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] text-muted">
          <span className="rounded-badge bg-emph px-1.5 py-0.5 font-sans text-[12px] font-bold text-on-emph">
            {event.form}
          </span>
          {[when, formatRoom(event.room)].filter(Boolean).join(" · ")}
        </span>
        {showSubject ? (
          <span className="mt-1 block leading-snug font-bold">{event.subjectName}</span>
        ) : null}
        {topics.length ? (
          <span className="mt-1 block text-[14px] leading-snug text-ink-2">
            {topics.slice(0, 3).join(" · ")}
            {topics.length > 3 ? " …" : ""}
          </span>
        ) : null}
        {event.materials.length ? (
          <span className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold text-accent">
            <Paperclip size={14} aria-hidden />
            {plural(event.materials.length, "материал", "материала", "материалов")} для подготовки
          </span>
        ) : null}
      </span>
      <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
