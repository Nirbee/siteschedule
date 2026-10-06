import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Pencil } from "lucide-react";
import { LessonCard } from "@/components/schedule/lesson-card";
import { WeekStrip } from "@/components/schedule/week-strip";
import { buttonClass } from "@/components/ui/button";
import { isStaff, requireMember } from "@/lib/auth/current";
import { addDays, isIsoDate, mondayOf, todayInMoscow } from "@/lib/schedule/dates";
import { dayMonth, plural, shortDate, weekdayName } from "@/lib/schedule/format";
import { resolveDay, resolveWeek, summarizeDay } from "@/lib/schedule/resolve";
import type { ScheduleData } from "@/lib/schedule/types";
import { PARITY_LABELS, weekInfo } from "@/lib/schedule/week";
import { loadScheduleData } from "@/lib/services/schedule";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [{ user }, params, data] = await Promise.all([
    requireMember(),
    searchParams,
    loadScheduleData(),
  ]);
  const today = todayInMoscow();
  const date = isIsoDate(params.date) ? params.date : today;
  const groupId = user.groupId!;
  const staff = isStaff(user.role);

  if (!data) {
    return <EmptyState title="Расписание ещё не настроено" text="Староста скоро его заполнит." />;
  }

  const monday = mondayOf(date);
  const week = resolveWeek(data, monday, groupId);
  const lessons = week.find((d) => d.date === date)?.lessons ?? [];
  const info = weekInfo(data.semester, date);
  const summary = summarizeDay(lessons);

  const eyebrow =
    date === today ? "Сегодня" : date === addDays(today, 1) ? "Завтра" : weekdayName(date);
  const title = `${capitalize(weekdayName(date))}, ${dayMonth(date)}`;
  const summaryText = [
    summary.lessons ? plural(summary.lessons, "пара", "пары", "пар") : "пар нет",
    summary.cancelled ? plural(summary.cancelled, "отмена", "отмены", "отмен") : null,
    summary.changed ? plural(summary.changed, "изменение", "изменения", "изменений") : null,
    summary.movedOut ? plural(summary.movedOut, "перенос", "переноса", "переносов") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 eyebrow">
            {eyebrow}
            {info ? ` · ${info.number} неделя · ${PARITY_LABELS[info.parity]}` : ""}
          </p>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[38px]">
            {title}
          </h1>
          <p className="mt-1 text-ink-2">{summaryText}</p>
        </div>
        <div className="flex gap-2">
          {date !== today ? (
            <Link href="/" className={buttonClass("secondary")}>
              Сегодня
            </Link>
          ) : null}
          <Link href={`/week?w=${monday}` as Route} className={buttonClass("secondary")}>
            Вся неделя
          </Link>
          {staff ? (
            <Link href="/manage/changes/new" className={buttonClass("secondary")}>
              <Pencil size={18} aria-hidden />{" "}
              <span className="sr-only md:not-sr-only">Изменить</span>
            </Link>
          ) : null}
        </div>
      </header>

      <WeekStrip days={week} selected={date} today={today} />

      <section aria-label="Пары" className="flex flex-col gap-2 md:gap-3">
        {lessons.length ? (
          lessons.map((lesson, i) => (
            <LessonCard
              key={`${lesson.entryId ?? lesson.changeId}-${i}`}
              lesson={lesson}
              showConflict={staff}
            />
          ))
        ) : (
          <NoLessons data={data} date={date} groupId={groupId} />
        )}
      </section>
    </div>
  );
}

function NoLessons({ data, date, groupId }: { data: ScheduleData; date: string; groupId: string }) {
  let next: string | null = null;
  for (let i = 1; i <= 21 && !next; i++) {
    const candidate = addDays(date, i);
    if (summarizeDay(resolveDay(data, candidate, groupId)).lessons > 0) next = candidate;
  }
  return (
    <div className="rounded-card border border-line bg-surface p-[22px] text-center">
      <p className="font-display text-[22px] font-bold">Пар нет</p>
      {next ? (
        <Link
          href={`/?date=${next}` as Route}
          className="mt-2 inline-flex items-center gap-1.5 font-semibold"
        >
          Ближайший учебный день — {shortDate(next)} <ArrowRight size={16} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-[22px]">
      <p className="font-bold">{title}</p>
      <p className="text-muted">{text}</p>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
