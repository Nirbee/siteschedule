import type { Metadata, Route } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AssignmentCard } from "@/components/tasks/assignment-card";
import { ControlCard } from "@/components/tasks/control-card";
import { controlTime, dayHeading, dueTime } from "@/components/tasks/format";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isStaff, requireMember } from "@/lib/auth/current";
import { addDays, todayInMoscow, type IsoDate } from "@/lib/schedule/dates";
import { shortDate } from "@/lib/schedule/format";
import { loadScheduleData } from "@/lib/services/schedule";
import { tasksFeed, type ControlEventView, type PlacedAssignment } from "@/lib/services/tasks";

export const metadata: Metadata = { title: "Задания" };

type Filter = "all" | "homework" | "control";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "homework", label: "Задания" },
  { value: "control", label: "Контрольные" },
];
/** How far ahead and back the page looks. */
const AHEAD_DAYS = 120;
const PAST_DAYS = 45;

type Entry =
  | { type: "homework"; date: IsoDate; item: PlacedAssignment }
  | { type: "control"; date: IsoDate; item: ControlEventView };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; past?: string }>;
}) {
  const [{ user }, search, data] = await Promise.all([
    requireMember(),
    searchParams,
    loadScheduleData(),
  ]);
  const staff = isStaff(user.role);
  const today = todayInMoscow();
  const filter: Filter = FILTERS.some((f) => f.value === search.f) ? (search.f as Filter) : "all";
  const past = search.past === "1";

  const range = past
    ? { from: addDays(today, -PAST_DAYS), to: addDays(today, -1) }
    : { from: today, to: addDays(today, AHEAD_DAYS) };
  const feed = await tasksFeed(user.id, user.groupId!, data, range);
  const slots = data?.slots ?? new Map();

  const entries: Entry[] = [
    ...(filter !== "control"
      ? feed.assignments.map((item): Entry => ({ type: "homework", date: item.due.date, item }))
      : []),
    ...(filter !== "homework"
      ? feed.controls.map((item): Entry => ({ type: "control", date: item.date, item }))
      : []),
  ].sort((a, b) => (past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  // Control events first within a day: they matter more.
  const days = new Map<IsoDate, Entry[]>();
  for (const entry of entries) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  for (const list of days.values())
    list.sort((a, b) => (a.type === b.type ? 0 : a.type === "control" ? -1 : 1));

  const href = (patch: { f?: Filter; past?: boolean }) => {
    const params = new URLSearchParams();
    const f = patch.f ?? filter;
    if (f !== "all") params.set("f", f);
    if (patch.past ?? past) params.set("past", "1");
    const query = params.toString();
    return `/tasks${query ? `?${query}` : ""}` as Route;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow={past ? "Прошедшие" : "Что задано"} title="Задания" />
        {staff ? (
          <div className="mb-6 flex gap-2">
            <Link
              href="/manage/tasks/new?type=assignment"
              className={buttonClass("secondary", "px-4")}
            >
              <Plus size={18} aria-hidden /> Задание
            </Link>
            <Link
              href="/manage/tasks/new?type=control"
              className={buttonClass("secondary", "px-4")}
            >
              <Plus size={18} aria-hidden /> Контрольная
            </Link>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ f: f.value })}
            aria-current={filter === f.value ? "true" : undefined}
            className={`flex h-9 items-center rounded-full border px-4 text-[14px] no-underline ${
              filter === f.value
                ? "border-emph bg-emph font-bold text-on-emph"
                : "border-line-strong text-ink-2 hover:bg-chip"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {days.size === 0 ? (
        <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
          {past
            ? "За последние полтора месяца ничего не было."
            : filter === "control"
              ? "Ближайших контрольных нет."
              : "Пока ничего не задано."}
        </p>
      ) : (
        [...days].map(([date, list]) => (
          <section key={date} aria-label={shortDate(date)} className="flex flex-col gap-2">
            <h2 className="eyebrow">{past ? shortDate(date) : dayHeading(today, date)}</h2>
            {list.map((entry) =>
              entry.type === "control" ? (
                <ControlCard
                  key={entry.item.id}
                  event={entry.item}
                  when={controlTime(entry.item, slots)}
                />
              ) : (
                <AssignmentCard
                  key={entry.item.id}
                  item={entry.item}
                  when={dueTime(entry.item.due, slots)}
                  moved={entry.item.moved}
                  staff={staff}
                />
              ),
            )}
          </section>
        ))
      )}

      <Link href={href({ past: !past })} className="self-start text-[14px] font-semibold">
        {past ? "← К ближайшим" : "Прошедшие →"}
      </Link>
    </div>
  );
}
