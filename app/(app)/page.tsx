import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { LessonCard } from "@/components/schedule/lesson-card";
import { AssignmentCard } from "@/components/tasks/assignment-card";
import { ControlCard } from "@/components/tasks/control-card";
import { controlTime, dueTime } from "@/components/tasks/format";
import { HeadsUp } from "@/components/tasks/heads-up";
import { UpcomingList } from "@/components/tasks/upcoming-list";
import { WeekStrip } from "@/components/schedule/week-strip";
import { buttonClass } from "@/components/ui/button";
import { isStaff, requireMember } from "@/lib/auth/current";
import { addDays, isIsoDate, mondayOf, todayInMoscow } from "@/lib/schedule/dates";
import { dayMonth, plural, shortDate, weekdayName } from "@/lib/schedule/format";
import { resolveDay, resolveWeek, summarizeDay } from "@/lib/schedule/resolve";
import type { ScheduleData } from "@/lib/schedule/types";
import { PARITY_LABELS, weekInfo } from "@/lib/schedule/week";
import { lessonKey } from "@/lib/ingest/targets";
import { noteCounts } from "@/lib/services/library";
import { loadScheduleData } from "@/lib/services/schedule";
import { tasksFeed } from "@/lib/services/tasks";
import { presentations, type Presentation } from "@/lib/services/topics";
import { isHappening } from "@/lib/schedule/resolve";
import { attachToLessons, tasksOfDay } from "@/lib/tasks/place";

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
  // The shown week (strip marks), the shown day and the next weeks («Скоро»).
  const rangeFrom = monday < today ? monday : today;
  const later = date > today ? date : today;
  const rangeTo =
    addDays(later, UPCOMING_DAYS) > addDays(monday, 6)
      ? addDays(later, UPCOMING_DAYS)
      : addDays(monday, 6);
  const week = resolveWeek(data, monday, groupId);
  const [notes, feed, talks] = await Promise.all([
    noteCounts(monday, addDays(monday, 6)),
    tasksFeed(user.id, groupId, data, { from: rangeFrom, to: rangeTo }),
    presentations(user.id, rangeFrom, rangeTo),
  ]);
  const notesFor = (l: (typeof week)[number]["lessons"][number]) =>
    l.status === "cancelled" || l.status === "moved_out"
      ? undefined
      : notes.get(
          lessonKey({ subjectId: l.subject.id, date: l.date, slotN: l.slotN, time: l.time }),
        );
  const lessons = week.find((d) => d.date === date)?.lessons ?? [];
  const info = weekInfo(data.semester, date);
  const summary = summarizeDay(lessons);
  const tasks = tasksOfDay(lessons, date, feed.assignments, feed.controls);
  const marks = Object.fromEntries(
    week.map(({ date: day }) => [
      day,
      {
        exams: feed.controls.filter((c) => c.date === day).map((c) => c.form),
        homework: feed.assignments.filter((a) => a.due.date === day && !a.done).length,
        talk: talks.some((t) => t.mine && t.date === day),
      },
    ]),
  );
  // «Выступают»: presentations go to the first lesson of their subject that day.
  const dayTalks = attachToLessons(
    lessons,
    talks
      .filter((t) => t.date === date)
      .map((t) => ({ ...t, due: { date, slotN: null, startsAt: null } })),
  );
  // «Скоро»: unfinished homework for the week; control events and own talks after tomorrow
  // (today's and tomorrow's are in the big notes above).
  const upcoming =
    date === today
      ? {
          controls: feed.controls.filter((c) => c.date > addDays(today, 1)),
          assignments: feed.assignments.filter(
            (a) => a.due.date > today && a.due.date <= addDays(today, 7) && !a.done,
          ),
          talks: talks.filter((t) => t.mine && t.date > addDays(today, 1)),
        }
      : null;

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

      {date === today ? (
        <HeadsUp
          today={today}
          tomorrow={addDays(today, 1)}
          controls={feed.controls}
          talks={talks}
          slots={data.slots}
        />
      ) : null}

      <WeekStrip days={week} selected={date} today={today} marks={marks} />

      {tasks.dayLevel.controls.length || tasks.dayLevel.assignments.length ? (
        <section aria-label="На этот день" className="flex flex-col gap-2">
          <h2 className="eyebrow">На этот день</h2>
          {tasks.dayLevel.controls.map((c) => (
            <ControlCard key={c.id} event={c} when={controlTime(c, data.slots)} />
          ))}
          {tasks.dayLevel.assignments.map((a) => (
            <AssignmentCard
              key={a.id}
              item={a}
              when={dueTime(a.due, data.slots)}
              moved={a.moved}
              staff={staff}
            />
          ))}
        </section>
      ) : null}

      <section aria-label="Пары" className="flex flex-col gap-2 md:gap-3">
        {lessons.length ? (
          lessons.map((lesson, i) => {
            const own = tasks.byLesson.get(i);
            const speakers = dayTalks.byLesson.get(i);
            const canAdd = staff && isHappening(lesson) && lesson.kind !== "self_study";
            return (
              <LessonCard
                key={`${lesson.entryId ?? lesson.changeId}-${i}`}
                lesson={lesson}
                notes={notesFor(lesson)}
                showConflict={staff}
                exam={Boolean(own?.controls.length)}
              >
                {own || canAdd || speakers ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {speakers ? <Speakers talks={speakers} /> : null}
                    {own?.controls.map((c) => (
                      <ControlCard
                        key={c.id}
                        event={c}
                        when="на этой паре"
                        showSubject={false}
                        flat
                      />
                    ))}
                    {own?.assignments.map((a) => (
                      <AssignmentCard
                        key={a.id}
                        item={a}
                        when="к этой паре"
                        moved={a.moved}
                        staff={staff}
                        showSubject={false}
                        flat
                      />
                    ))}
                    {canAdd ? (
                      <Link
                        href={
                          `/manage/tasks/new?type=assignment&subject=${lesson.subject.id}` as Route
                        }
                        className="inline-flex min-h-9 items-center gap-1 self-start text-[13px] font-semibold text-muted"
                      >
                        <Plus size={15} aria-hidden /> Задание к следующей паре
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </LessonCard>
            );
          })
        ) : (
          <NoLessons data={data} date={date} groupId={groupId} />
        )}
      </section>

      {upcoming ? (
        <UpcomingList
          today={today}
          assignments={upcoming.assignments}
          controls={upcoming.controls}
          talks={upcoming.talks}
        />
      ) : null}
    </div>
  );
}

/** «Выступают» on a lesson card: who presents which topic, in order. */
function Speakers({ talks }: { talks: Presentation[] }) {
  return (
    <Link
      href={`/topics/${talks[0]!.listId}?tab=queue` as Route}
      className="block rounded-[12px] bg-surface-muted px-3 py-2.5 text-ink no-underline hover:bg-chip"
    >
      <span className="mb-1 block text-[12px] font-bold tracking-[0.04em] text-muted uppercase">
        Выступают
      </span>
      <ol className="flex flex-col gap-1 text-[14px]">
        {talks.map((t) => (
          <li key={`${t.listId}-${t.n}`} className={t.mine ? "font-bold" : undefined}>
            {t.names.join(", ")}{" "}
            <span className="text-muted">
              — {t.n}. {t.title}
            </span>
          </li>
        ))}
      </ol>
    </Link>
  );
}

/** How far ahead «Скоро» looks for control events. */
const UPCOMING_DAYS = 21;

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
