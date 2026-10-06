import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Settings2 } from "lucide-react";
import { TaskText } from "@/components/tasks/task-text";
import { CodeEntry } from "@/components/topics/code-entry";
import { phaseText, STATUS_LABELS, STATUS_STYLES } from "@/components/topics/phase";
import { PickButton } from "@/components/topics/pick-button";
import { buttonClass } from "@/components/ui/button";
import { isStaff, requireMember } from "@/lib/auth/current";
import { todayInMoscow, type IsoDate } from "@/lib/schedule/dates";
import { shortDate } from "@/lib/schedule/format";
import { getTopicList, type TopicView } from "@/lib/services/topics";
import { untilLabel } from "@/lib/tasks/place";

type Params = { listId: string };
type Search = { tab?: string; f?: string; code?: string };

async function load(id: string, user: Parameters<typeof getTopicList>[1]) {
  return /^[0-9a-f-]{36}$/.test(id) ? getTopicList(id, user) : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { user } = await requireMember();
  const list = await load((await params).listId, user);
  return { title: list ? `${list.title} · ${list.subjectName}` : "Темы" };
}

export default async function TopicListPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ user }, { listId }, search] = await Promise.all([requireMember(), params, searchParams]);
  const list = await load(listId, user);
  if (!list) notFound();
  const staff = isStaff(user.role);
  const tab = search.tab === "queue" ? "queue" : "topics";
  const onlyFree = search.f === "free";
  const hasMine = list.topics.some((t) => t.status === "mine");
  const shown = onlyFree
    ? list.topics.filter((t) => t.status === "free" || t.status === "partial")
    : list.topics;
  const href = (patch: Search) => {
    const next = new URLSearchParams();
    const t = patch.tab ?? tab;
    const f = patch.f ?? (onlyFree ? "free" : "");
    if (t === "queue") next.set("tab", "queue");
    if (f === "free" && t !== "queue") next.set("f", "free");
    const query = next.toString();
    return `/topics/${list.id}${query ? `?${query}` : ""}` as Route;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/topics"
          className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          <ArrowLeft size={16} aria-hidden /> Все списки
        </Link>
        <p className="mb-1 eyebrow">{list.subjectName}</p>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
          {list.title}
        </h1>
        <p className="mt-1.5 text-ink-2">
          {phaseText(list)} · занято {list.full} из {list.total}
          {list.defaultCapacity > 1 ? ` · по ${list.defaultCapacity} чел. на тему` : ""}
        </p>
        {staff ? (
          <Link
            href={`/manage/topics/${list.id}` as Route}
            className={buttonClass("secondary", "mt-3")}
          >
            <Settings2 size={18} aria-hidden /> Управлять списком
          </Link>
        ) : null}
      </div>

      {list.phase === "class" && !staff ? (
        list.hasClassAccess ? (
          <p className="flex items-center gap-2 rounded-card bg-add-bg p-[14px] font-semibold text-add">
            <CheckCircle2 size={18} aria-hidden /> Код принят — выбирайте тему
          </p>
        ) : (
          <CodeEntry listId={list.id} initialCode={search.code} />
        )
      ) : null}

      {list.rules ? (
        <div className="rounded-card bg-surface-muted p-[14px] text-[14px] text-ink-2">
          <TaskText text={list.rules} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[14px] bg-chip p-1">
          {(
            [
              ["topics", "Темы"],
              ["queue", "Очередь сдачи"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              role="tab"
              aria-selected={tab === value}
              href={href({ tab: value })}
              className={`flex h-10 items-center justify-center rounded-[10px] px-3 text-[14px] no-underline ${
                tab === value ? "bg-surface font-bold text-ink" : "font-semibold text-ink-2"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        {tab === "topics" ? (
          <Link
            href={href({ f: onlyFree ? "all" : "free" })}
            aria-current={onlyFree ? "true" : undefined}
            className={`flex h-9 items-center rounded-full border px-4 text-[14px] no-underline ${
              onlyFree
                ? "border-emph bg-emph font-bold text-on-emph"
                : "border-line-strong text-ink-2 hover:bg-chip"
            }`}
          >
            Только свободные
          </Link>
        ) : null}
      </div>

      {tab === "topics" ? (
        <ul className="flex flex-col gap-2">
          {shown.length === 0 ? (
            <li className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
              Свободных тем не осталось.
            </li>
          ) : (
            shown.map((topic) => (
              <li key={topic.id}>
                <TopicCard
                  topic={topic}
                  action={
                    !list.canPick || topic.isDone
                      ? null
                      : topic.status === "mine"
                        ? "leave"
                        : hasMine
                          ? null
                          : topic.status === "free"
                            ? "take"
                            : topic.status === "partial"
                              ? "join"
                              : null
                  }
                />
              </li>
            ))
          )}
        </ul>
      ) : (
        <Queue topics={list.topics} today={todayInMoscow()} />
      )}
    </div>
  );
}

function TopicCard({
  topic,
  action,
}: {
  topic: TopicView;
  action: "take" | "join" | "leave" | null;
}) {
  const free = topic.capacity - topic.members.length;
  const meta = [
    topic.capacity > 1
      ? `на ${topic.capacity} чел.${free > 0 && !topic.isDone ? ` · свободно ${free}` : ""}`
      : null,
    topic.dueDate
      ? `сдача ${shortDate(topic.dueDate)}${topic.dueOrder ? ` · ${topic.dueOrder}-й` : ""}`
      : null,
  ].filter(Boolean);
  return (
    <article
      className={`flex flex-col gap-3 rounded-card border bg-surface p-[14px] sm:flex-row sm:items-center md:p-[18px] ${
        topic.status === "mine" ? "border-2 border-add" : "border-line"
      } ${topic.isDone ? "opacity-70" : ""}`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="w-7 shrink-0 pt-0.5 text-right font-mono text-[15px] text-muted">
          {topic.n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <h3 className="leading-snug font-bold">{topic.title}</h3>
            <span
              className={`rounded-badge px-2 py-0.5 text-[12px] font-bold ${STATUS_STYLES[topic.status]}`}
            >
              {STATUS_LABELS[topic.status]}
            </span>
          </div>
          {topic.details ? (
            <p className="mt-0.5 text-[15px] leading-snug text-ink-2">{topic.details}</p>
          ) : null}
          {topic.members.length ? (
            <p className="mt-1.5 text-[14px] text-ink">
              {topic.members.map((m, i) => (
                <span key={m.userId}>
                  {i > 0 ? ", " : ""}
                  {m.name}
                  {m.group ? <span className="font-mono text-muted"> · {m.group}</span> : null}
                </span>
              ))}
            </p>
          ) : null}
          {meta.length ? (
            <p className="mt-1 font-mono text-[13px] text-muted">{meta.join(" · ")}</p>
          ) : null}
        </div>
      </div>
      {action ? <PickButton topicId={topic.id} mode={action} topicTitle={topic.title} /> : null}
    </article>
  );
}

function Queue({ topics, today }: { topics: TopicView[]; today: IsoDate }) {
  const dated = topics
    .filter((t) => t.dueDate && t.members.length)
    .sort(
      (a, b) =>
        a.dueDate!.localeCompare(b.dueDate!) ||
        (a.dueOrder ?? 99) - (b.dueOrder ?? 99) ||
        a.n - b.n,
    );
  const undated = topics.filter((t) => !t.dueDate && t.members.length).length;
  const days = new Map<IsoDate, TopicView[]>();
  for (const t of dated) days.set(t.dueDate!, [...(days.get(t.dueDate!) ?? []), t]);

  if (days.size === 0)
    return (
      <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
        Даты сдачи ещё не назначены{undated ? ` (тем с участниками: ${undated})` : ""}.
      </p>
    );
  return (
    <div className="flex flex-col gap-4">
      {[...days].map(([date, list]) => (
        <section key={date} className="flex flex-col gap-2">
          <h2 className="eyebrow">
            {shortDate(date)} · {untilLabel(today, date)}
          </h2>
          <ol className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
            {list.map((t) => (
              <li
                key={t.id}
                className={`flex gap-3 border-b border-line px-[14px] py-3 last:border-b-0 ${
                  t.isDone ? "opacity-60" : ""
                }`}
              >
                <span className="w-6 shrink-0 font-mono text-[14px] text-muted">
                  {t.dueOrder ?? "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {t.members.map((m) => m.name).join(", ")}
                  </span>
                  <span className="block text-[14px] text-ink-2">
                    {t.n}. {t.title}
                    {t.details ? ` — ${t.details}` : ""}
                    {t.isDone ? " · сдано" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {undated ? (
        <p className="text-[14px] text-muted">
          Ещё {undated} тем(ы) с участниками без даты — староста назначит.
        </p>
      ) : null}
    </div>
  );
}
