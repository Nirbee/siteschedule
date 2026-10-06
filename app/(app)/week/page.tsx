import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LessonCard } from "@/components/schedule/lesson-card";
import { buttonClass } from "@/components/ui/button";
import { isStaff, requireMember } from "@/lib/auth/current";
import { addDays, isIsoDate, mondayOf, todayInMoscow } from "@/lib/schedule/dates";
import { dayMonth, shortWeekday } from "@/lib/schedule/format";
import { resolveWeek } from "@/lib/schedule/resolve";
import { PARITY_LABELS, weekInfo } from "@/lib/schedule/week";
import { lessonKey } from "@/lib/ingest/targets";
import { noteCounts } from "@/lib/services/library";
import { loadScheduleData } from "@/lib/services/schedule";
import { tasksFeed } from "@/lib/services/tasks";
import { tasksOfDay } from "@/lib/tasks/place";

export const metadata: Metadata = { title: "Расписание" };

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const [{ user }, params, data] = await Promise.all([
    requireMember(),
    searchParams,
    loadScheduleData(),
  ]);
  const today = todayInMoscow();
  const monday = mondayOf(isIsoDate(params.w) ? params.w : today);
  const staff = isStaff(user.role);

  if (!data) {
    return <p className="text-muted">Расписание ещё не настроено.</p>;
  }

  const week = resolveWeek(data, monday, user.groupId!);
  const [notes, feed] = await Promise.all([
    noteCounts(monday, addDays(monday, 6)),
    tasksFeed(user.id, user.groupId!, data, { from: monday, to: addDays(monday, 6) }),
  ]);
  const notesFor = (l: (typeof week)[number]["lessons"][number]) =>
    l.status === "cancelled" || l.status === "moved_out"
      ? undefined
      : notes.get(
          lessonKey({ subjectId: l.subject.id, date: l.date, slotN: l.slotN, time: l.time }),
        );
  const days = week.filter((d, i) => i < 6 || d.lessons.length > 0);
  const info = weekInfo(data.semester, monday) ?? weekInfo(data.semester, addDays(monday, 5));
  const lastDay = days[days.length - 1]?.date ?? addDays(monday, 5);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 eyebrow">
            {info ? `${info.number} неделя · ${PARITY_LABELS[info.parity]}` : "Вне семестра"}
          </p>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[38px]">
            {Number(monday.slice(8))}–{dayMonth(lastDay)}
          </h1>
        </div>
        <nav aria-label="Недели" className="flex gap-2">
          <Link
            href={`/week?w=${addDays(monday, -7)}` as Route}
            aria-label="Предыдущая неделя"
            className={buttonClass("secondary", "px-3")}
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
          {monday !== mondayOf(today) ? (
            <Link href="/week" className={buttonClass("secondary")}>
              Эта неделя
            </Link>
          ) : null}
          <Link
            href={`/week?w=${addDays(monday, 7)}` as Route}
            aria-label="Следующая неделя"
            className={buttonClass("secondary", "px-3")}
          >
            <ChevronRight size={20} aria-hidden />
          </Link>
        </nav>
      </header>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {days.map(({ date, lessons }) => {
          const dayTasks = tasksOfDay(lessons, date, feed.assignments, feed.controls);
          return (
            <section key={date} aria-label={dayMonth(date)} className="flex flex-col gap-2">
              <Link
                href={`/?date=${date}` as Route}
                className={`flex items-baseline gap-2 no-underline ${
                  date === today ? "text-accent" : "text-ink"
                }`}
              >
                <span className="font-mono text-[13px] text-muted uppercase">
                  {shortWeekday(date)}
                </span>
                <span className="font-bold">{dayMonth(date)}</span>
                {date === today ? <span className="text-[13px] font-bold">· сегодня</span> : null}
              </Link>
              {dayTasks.dayLevel.controls.length || dayTasks.dayLevel.assignments.length ? (
                <TaskMarks
                  date={date}
                  controls={dayTasks.dayLevel.controls.map((c) => `${c.form} · ${c.subjectName}`)}
                  homework={dayTasks.dayLevel.assignments.length}
                />
              ) : null}
              {lessons.length ? (
                lessons.map((lesson, i) => {
                  const own = dayTasks.byLesson.get(i);
                  return (
                    <LessonCard
                      key={`${lesson.entryId ?? lesson.changeId}-${i}`}
                      lesson={lesson}
                      notes={notesFor(lesson)}
                      compact
                      showConflict={staff}
                    >
                      {own ? (
                        <TaskMarks
                          date={date}
                          controls={own.controls.map((c) => c.form)}
                          homework={own.assignments.length}
                        />
                      ) : null}
                    </LessonCard>
                  );
                })
              ) : (
                <p className="rounded-card border border-dashed border-line p-3 text-[14px] text-muted">
                  Пар нет
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Small «Задание» / «Контрольная» marks; the day page shows the details. */
function TaskMarks({
  date,
  controls,
  homework,
}: {
  date: string;
  controls: string[];
  homework: number;
}) {
  return (
    <Link href={`/?date=${date}` as Route} className="mt-1.5 flex flex-wrap gap-1.5 no-underline">
      {controls.map((label, i) => (
        <span
          key={i}
          className="rounded-badge bg-emph px-1.5 py-0.5 text-[12px] font-bold text-on-emph"
        >
          {label}
        </span>
      ))}
      {homework ? (
        <span className="rounded-badge bg-chip px-1.5 py-0.5 text-[12px] font-bold text-ink-2">
          {homework > 1 ? `Задания · ${homework}` : "Задание"}
        </span>
      ) : null}
    </Link>
  );
}
