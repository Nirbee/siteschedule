import type { Route } from "next";
import Link from "next/link";
import { CalendarClock, Pencil } from "lucide-react";
import type { AssignmentView } from "@/lib/services/tasks";
import { DoneToggle } from "./done-toggle";
import { MaterialList } from "./material-list";
import { TaskText } from "./task-text";

/** One homework: subject, when it is due, what to do, materials, «сделано». */
export function AssignmentCard({
  item,
  when,
  moved = false,
  staff = false,
  showSubject = true,
  flat = false,
}: {
  item: AssignmentView;
  /** «к 2 паре · 10:10» or a full date. */
  when: string;
  moved?: boolean;
  staff?: boolean;
  showSubject?: boolean;
  /** Inside a lesson card: no own border. */
  flat?: boolean;
}) {
  return (
    <article
      id={`a-${item.id}`}
      className={`scroll-mt-20 ${
        flat
          ? "rounded-[12px] bg-surface-muted px-3 pt-2.5 pb-1"
          : "rounded-card border border-line bg-surface p-[14px] pb-2 md:p-[18px] md:pb-2.5"
      } ${item.done ? "opacity-70" : ""}`}
    >
      <header className="mb-1.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[13px] text-muted">
            <span className="mr-1.5 rounded-badge bg-chip px-1.5 py-0.5 font-sans text-[12px] font-bold text-ink-2">
              Задание
            </span>
            {when}
          </p>
          {showSubject ? <h3 className="mt-1 leading-snug font-bold">{item.subjectName}</h3> : null}
        </div>
        {staff ? (
          <Link
            href={`/manage/tasks/assignment/${item.id}` as Route}
            aria-label="Изменить задание"
            className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chip"
          >
            <Pencil size={18} aria-hidden />
          </Link>
        ) : null}
      </header>
      <TaskText text={item.body} className="text-[15px] text-ink" />
      {moved ? (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-move">
          <CalendarClock size={16} aria-hidden /> Пару перенесли — срок сдвинулся вместе с ней
        </p>
      ) : null}
      {item.materials.length ? (
        <div className="mt-3">
          <MaterialList materials={item.materials} />
        </div>
      ) : null}
      <div className="mt-1.5">
        <DoneToggle id={item.id} done={item.done} />
      </div>
    </article>
  );
}
