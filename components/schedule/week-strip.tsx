import Link from "next/link";
import type { Route } from "next";
import type { IsoDate } from "@/lib/schedule/dates";
import { dayFlag, plural, shortWeekday, type DayFlagTone } from "@/lib/schedule/format";
import { summarizeDay, type ResolvedWeekDay } from "@/lib/schedule/resolve";

const TONE_TEXT: Record<DayFlagTone, string> = {
  move: "text-move",
  add: "text-add",
  cancel: "text-cancel",
  change: "text-change",
};
const TONE_DOT: Record<DayFlagTone, string> = {
  move: "bg-move",
  add: "bg-add",
  cancel: "bg-cancel",
  change: "bg-change",
};

/**
 * Mon–Sat tiles (Sunday only when something was moved there); the selected day is the dark tile.
 * Fits a 390px phone: there the change note collapses into a coloured dot.
 */
/** Homework, control events and the viewer's presentations of a day. */
export interface DayMarks {
  exams: string[]; // forms: «Контрольная работа»
  homework: number; // not done yet
  talk: boolean;
}

export function WeekStrip({
  days,
  selected,
  today,
  marks = {},
}: {
  days: ResolvedWeekDay[];
  selected: IsoDate;
  today: IsoDate;
  marks?: Record<IsoDate, DayMarks>;
}) {
  const visible = days.filter((d, i) => i < 6 || d.lessons.length > 0);

  return (
    <nav aria-label="Дни недели">
      <ul
        className={`grid gap-1.5 md:gap-3 ${visible.length === 7 ? "grid-cols-7" : "grid-cols-6"}`}
      >
        {visible.map(({ date, lessons }) => {
          const isSelected = date === selected;
          const count = summarizeDay(lessons).lessons;
          const flag = dayFlag(lessons);
          const mark = marks[date];
          const exam = mark?.exams[0];
          const extra = [
            exam ? exam.toLowerCase() : null,
            mark?.talk ? "твой доклад" : null,
            mark?.homework ? plural(mark.homework, "задание", "задания", "заданий") : null,
          ].filter(Boolean);
          const label = `${shortWeekday(date)}, ${Number(date.slice(8))}: ${
            count ? plural(count, "пара", "пары", "пар") : "нет пар"
          }${flag ? `, ${flag.text}` : ""}${extra.length ? `, ${extra.join(", ")}` : ""}`;
          return (
            <li key={date}>
              <Link
                href={`/?date=${date}` as Route}
                aria-current={isSelected ? "date" : undefined}
                aria-label={label}
                className={`relative flex h-full min-h-[72px] flex-col items-center rounded-[14px] border px-1 py-2 no-underline transition-colors md:min-h-[100px] md:items-start md:p-3 ${
                  isSelected
                    ? "border-emph bg-emph text-on-emph"
                    : `bg-surface text-ink hover:bg-surface-muted ${
                        date === today ? "border-accent" : "border-line"
                      }`
                }`}
              >
                <span
                  className={`font-mono text-[12px] uppercase ${isSelected ? "text-on-emph-muted" : "text-muted"}`}
                >
                  {shortWeekday(date)}
                </span>
                <span className="font-display text-[20px] leading-tight font-bold md:text-[24px]">
                  {Number(date.slice(8))}
                </span>
                <span
                  className={`hidden text-[12px] md:block ${isSelected ? "text-on-emph-muted" : "text-muted"}`}
                >
                  {count ? plural(count, "пара", "пары", "пар") : "нет пар"}
                </span>
                <span
                  className={`font-mono text-[12px] md:hidden ${isSelected ? "text-on-emph-muted" : "text-muted"}`}
                >
                  {count || "–"}
                </span>
                {flag ? (
                  <span
                    className={`mt-1 hidden max-w-full truncate text-[12px] font-bold md:block ${
                      isSelected ? "text-on-emph" : TONE_TEXT[flag.tone]
                    }`}
                  >
                    {flag.text}
                  </span>
                ) : null}
                {exam ? (
                  <span className="mt-1 hidden max-w-full truncate rounded-badge bg-exam px-1.5 py-0.5 text-[11px] font-bold text-exam-bg md:block">
                    {exam}
                  </span>
                ) : null}
                {mark?.talk || mark?.homework ? (
                  <span
                    className={`mt-1 hidden max-w-full truncate text-[12px] md:block ${
                      isSelected ? "text-on-emph-muted" : "text-ink-2"
                    }`}
                  >
                    {[
                      mark.talk ? "твой доклад" : null,
                      mark.homework ? plural(mark.homework, "задание", "задания", "заданий") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
                {/* Phone: coloured dots instead of the notes. */}
                {flag || exam ? (
                  <span aria-hidden className="absolute top-2 right-2 flex gap-1 md:hidden">
                    {exam ? (
                      <span
                        className={`size-2 rounded-full ${isSelected ? "bg-on-emph" : "bg-exam"}`}
                      />
                    ) : null}
                    {flag ? (
                      <span
                        className={`size-2 rounded-full ${
                          isSelected ? "bg-on-emph" : TONE_DOT[flag.tone]
                        }`}
                      />
                    ) : null}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
