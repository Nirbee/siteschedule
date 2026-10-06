import { KIND_LABELS, fromShortDate, shortDate } from "@/lib/schedule/format";
import type { LessonKind, ResolvedLesson } from "@/lib/schedule/types";

export function KindBadge({ kind }: { kind: LessonKind }) {
  return (
    <span className="rounded-badge bg-chip px-2 py-0.5 text-[12px] font-semibold text-ink-2">
      {KIND_LABELS[kind]}
    </span>
  );
}

const STATUS_STYLES = {
  cancelled: "bg-cancel-bg text-cancel",
  replaced: "bg-change-bg text-change",
  room_changed: "bg-change-bg text-change",
  moved_out: "bg-move-bg text-move",
  moved_in: "bg-move-bg text-move",
  added: "bg-add-bg text-add",
} as const;

/** Text label for a lesson's status (never colour alone). */
export function statusLabel(lesson: ResolvedLesson): string | null {
  switch (lesson.status) {
    case "cancelled":
      return "Отменена";
    case "replaced":
      return "Замена";
    case "room_changed":
      return "Аудитория изменена";
    case "moved_out":
      return lesson.movedTo
        ? `Перенесена на ${shortDate(lesson.movedTo.date)}, ${lesson.movedTo.time.start}`
        : "Перенесена";
    case "moved_in":
      return lesson.movedFrom ? `Перенос ${fromShortDate(lesson.movedFrom.date)}` : "Перенос";
    case "added":
      return "Доп. пара";
    default:
      return null;
  }
}

export function StatusBadge({ lesson }: { lesson: ResolvedLesson }) {
  const label = statusLabel(lesson);
  if (!label || lesson.status === "normal") return null;
  return (
    <span
      className={`rounded-badge px-2 py-0.5 text-[12px] font-bold ${STATUS_STYLES[lesson.status]}`}
    >
      {label}
    </span>
  );
}
