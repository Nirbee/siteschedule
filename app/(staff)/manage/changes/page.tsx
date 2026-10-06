import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/current";
import { todayInMoscow } from "@/lib/schedule/dates";
import { CHANGE_TYPE_LABELS, shortDate } from "@/lib/schedule/format";
import { listChangeHistory, type ChangeHistoryItem } from "@/lib/services/schedule";
import { formatRelativeDay } from "@/lib/time";
import { revokeChangeAction } from "./actions";

export const metadata: Metadata = { title: "История изменений" };

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; conflict?: string; revoked?: string }>;
}) {
  await requireRole("starosta", "admin");
  const [params, history] = await Promise.all([searchParams, listChangeHistory()]);
  const today = todayInMoscow();
  const upcoming = history.filter((c) => !c.revokedAt && c.affectedDate >= today);
  const past = history.filter((c) => c.revokedAt || c.affectedDate < today);
  const created = history.find((c) => c.id === params.created);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader eyebrow="Режим старосты" title="История изменений" />

      {created ? (
        <div
          role="status"
          className={`rounded-[14px] p-4 ${params.conflict ? "bg-cancel-bg text-cancel" : "bg-add-bg text-add"}`}
        >
          <p className="font-bold">
            {params.conflict
              ? "Опубликовано, но в это время у группы уже есть другая пара — проверьте день."
              : "Опубликовано. Изменение уже видно группе."}
          </p>
          <p className="mt-1 text-ink-2">{created.description}</p>
          <Link
            href={`/?date=${created.affectedDate}` as Route}
            className="mt-2 inline-block font-semibold"
          >
            Открыть день
          </Link>
        </div>
      ) : null}
      {params.revoked ? (
        <p role="status" className="rounded-[14px] bg-surface-muted p-4 font-semibold">
          Изменение отозвано — пара снова по обычному расписанию.
        </p>
      ) : null}

      <Link href="/manage/changes/new" className={buttonClass("primary", "w-full")}>
        <Plus size={20} aria-hidden /> Новое изменение
      </Link>

      <Section title="Предстоящие" items={upcoming} empty="Предстоящих изменений нет." revocable />
      <Section title="Прошедшие и отозванные" items={past} empty="Пока пусто." />
    </div>
  );
}

function Section({
  title,
  items,
  empty,
  revocable = false,
}: {
  title: string;
  items: ChangeHistoryItem[];
  empty: string;
  revocable?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="eyebrow">{title}</h2>
      {items.length === 0 ? <p className="text-muted">{empty}</p> : null}
      {items.map((item) => (
        <article
          key={item.id}
          className={`rounded-card border border-line bg-surface p-[14px] ${item.revokedAt ? "opacity-60" : ""}`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-badge bg-chip px-2 py-0.5 font-semibold text-ink-2">
              {CHANGE_TYPE_LABELS[item.type]}
            </span>
            <span className="font-mono text-muted">{shortDate(item.affectedDate)}</span>
            {item.revokedAt ? (
              <span className="rounded-badge bg-cancel-bg px-2 py-0.5 font-bold text-cancel">
                Отозвано
              </span>
            ) : null}
          </div>
          <p className={item.revokedAt ? "line-through" : "font-semibold"}>{item.description}</p>
          {item.comment ? <p className="mt-1 text-[14px] text-ink-2">{item.comment}</p> : null}
          <p className="mt-1 text-[13px] text-muted">
            {item.authorName} · {formatRelativeDay(item.createdAt)}
          </p>
          {revocable && !item.revokedAt ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[14px] font-semibold text-cancel">
                Отозвать
              </summary>
              <form action={revokeChangeAction} className="mt-2">
                <input type="hidden" name="changeId" value={item.id} />
                <p className="mb-2 text-[14px] text-ink-2">
                  Пара вернётся к обычному расписанию. Изменение останется в истории.
                </p>
                <button type="submit" className={buttonClass("danger", "w-full")}>
                  Да, отозвать изменение
                </button>
              </form>
            </details>
          ) : null}
        </article>
      ))}
    </section>
  );
}
