import { Megaphone, TriangleAlert } from "lucide-react";
import { formatRoom } from "@/lib/schedule/format";
import type { ResolvedLesson } from "@/lib/schedule/types";
import { KindBadge, StatusBadge } from "./badges";

/** A lesson with all its statuses (docs/DESIGN.md «LessonCard»). */
export function LessonCard({
  lesson,
  compact = false,
  showConflict = false,
}: {
  lesson: ResolvedLesson;
  compact?: boolean;
  showConflict?: boolean;
}) {
  if (lesson.kind === "self_study") return <SelfStudyCard lesson={lesson} compact={compact} />;

  const struck = lesson.status === "cancelled" || lesson.status === "moved_out";
  const meta = [formatRoom(lesson.room), compact ? null : lesson.teacher]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`flex rounded-card border border-line bg-surface ${
        compact ? "gap-3 p-3" : "gap-4 p-[14px] md:gap-5 md:p-[22px]"
      }`}
    >
      <div className="w-[52px] shrink-0 font-mono font-tabular">
        {lesson.slotN !== null && !compact ? (
          <div className="mb-1 text-[11px] tracking-[0.08em] text-muted uppercase">
            {lesson.slotN} пара
          </div>
        ) : null}
        <div className={`font-semibold ${struck ? "text-struck" : ""}`}>{lesson.time.start}</div>
        <div className="text-[13px] text-muted">{lesson.time.end}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {compact ? null : <KindBadge kind={lesson.kind} />}
          <StatusBadge lesson={lesson} />
        </div>
        <h3
          className={`leading-snug font-bold ${compact ? "text-[15px]" : "text-[17px]"} ${
            struck ? "text-struck line-through" : ""
          }`}
        >
          {lesson.subject.name}
        </h3>
        {lesson.status === "replaced" && lesson.original ? (
          <p className="mt-0.5 text-[14px] text-change">
            вместо «{lesson.original.subjectName}»
            {lesson.original.room !== lesson.room
              ? ` · ${lesson.original.room ?? "—"} → ${lesson.room ?? "—"}`
              : ""}
          </p>
        ) : null}
        {lesson.status === "room_changed" && lesson.original ? (
          <p className="mt-0.5 text-[14px] text-change">
            {lesson.original.room ?? "—"} → {lesson.room}
          </p>
        ) : null}
        {meta ? <p className="mt-0.5 text-[14px] text-muted">{meta}</p> : null}
        {lesson.comment && !compact ? <StaffNote text={lesson.comment} /> : null}
        {lesson.conflict && showConflict ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-cancel">
            <TriangleAlert size={16} aria-hidden /> Пересекается по времени с другой парой
          </p>
        ) : null}
      </div>
    </article>
  );
}

function SelfStudyCard({ lesson, compact }: { lesson: ResolvedLesson; compact: boolean }) {
  return (
    <article
      className={`flex items-center rounded-card bg-surface-muted text-muted ${
        compact ? "gap-3 p-3" : "gap-4 px-[14px] py-3 md:gap-5 md:px-[22px]"
      }`}
    >
      <div className="w-[52px] shrink-0 font-mono text-[13px] font-tabular">
        {lesson.time.start}
      </div>
      <p className="text-[14px] font-semibold">{lesson.subject.name}</p>
    </article>
  );
}

/** Starosta's comment under a lesson. */
export function StaffNote({ text }: { text: string }) {
  return (
    <p className="mt-3 flex gap-2 rounded-[12px] bg-surface-muted px-3 py-2.5 text-[14px] text-ink-2">
      <Megaphone size={18} strokeWidth={1.8} className="mt-px shrink-0 text-muted" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
