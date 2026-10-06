import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { batches, moscowClock } from "@/lib/ingest/sort";
import { KIND_LABELS, shortDate } from "@/lib/schedule/format";
import { inboxCounts, lessonChoices, listAutoSorted, listUnsorted } from "@/lib/services/inbox";
import { listSubjects } from "@/lib/services/schedule-admin";
import { InboxBoard, type BoardBatch, type LessonChoice } from "./inbox-board";

export const metadata: Metadata = { title: "Неразобранное" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole("starosta", "admin");
  const tab = (await searchParams).tab === "auto" ? "auto" : "unsorted";
  const [counts, items, subjectRows] = await Promise.all([
    inboxCounts(),
    tab === "auto" ? listAutoSorted() : listUnsorted(),
    listSubjects(),
  ]);

  // Batches as the robot saw them: one album / one author's messages ≤2 min apart.
  const groups: BoardBatch[] = batches(
    items.map((i) => ({
      kind: i.kind,
      caption: i.caption ?? "",
      fileName: i.fileName,
      postedAt: i.postedAt,
      authorId: i.authorId,
      mediaGroupId: null,
    })),
  ).map((indices) => {
    const members = indices.map((i) => items[i]!);
    const first = members[0]!;
    const clock = moscowClock(first.postedAt);
    return {
      day: clock.date,
      time: clock.time,
      author: first.authorName,
      caption: members.map((m) => m.caption).find(Boolean) ?? null,
      hint:
        first.subjectId && first.date
          ? {
              subjectId: first.subjectId,
              subjectName: first.subjectName!,
              date: first.date,
              slotN: first.slotN,
            }
          : first.subjectId
            ? {
                subjectId: first.subjectId,
                subjectName: first.subjectName!,
                date: null,
                slotN: null,
              }
            : null,
      reason: first.reason,
      items: members.map((m) => ({ id: m.id, kind: m.kind, name: m.title ?? m.fileName })),
    };
  });
  if (tab === "auto") groups.reverse();

  const days = [...new Set(groups.map((g) => g.day))];
  const lessons: LessonChoice[] = (await lessonChoices(days)).map((l) => ({
    value: JSON.stringify({
      type: "lesson",
      subjectId: l.subjectId,
      date: l.date,
      slotN: l.slotN,
      startsAt: l.startsAt,
      kind: l.kind,
    }),
    subjectId: l.subjectId,
    date: l.date,
    slotN: l.slotN,
    label: `${shortDate(l.date)} · ${l.slotN !== null ? `${l.slotN} пара` : l.start} · ${l.subjectName} (${KIND_LABELS[l.kind].toLowerCase()})`,
  }));
  const subjects = subjectRows
    .filter((s) => s.name !== "Самостоятельная работа")
    .map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="flex flex-col gap-5 pb-40">
      <PageHeader eyebrow="Фото и файлы из чата" title="Разбор" />
      <div role="tablist" className="grid grid-cols-2 gap-1 self-start rounded-[14px] bg-chip p-1">
        {(
          [
            ["unsorted", `Неразобранное · ${counts.unsorted}`],
            ["auto", `Разложено само · ${counts.auto}`],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            role="tab"
            aria-selected={tab === value}
            href={(value === "auto" ? "/manage/inbox?tab=auto" : "/manage/inbox") as Route}
            className={`flex h-10 items-center justify-center rounded-[10px] px-3 text-[14px] no-underline ${
              tab === value ? "bg-surface font-bold text-ink" : "font-semibold text-ink-2"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <p className="-mt-2 text-[14px] text-muted">
        {tab === "auto"
          ? "Что разложилось по времени и подписям. Если что-то не туда — выберите и переложите."
          : "Нажмите на фото, чтобы выбрать; «Принять» — согласиться с подсказкой для всей пачки. Не учебное — удалить."}
      </p>
      {groups.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
          {tab === "auto" ? "Пока ничего не разложилось само." : "Всё разобрано."}
        </p>
      ) : (
        <InboxBoard batches={groups} lessons={lessons} subjects={subjects} mode={tab} />
      )}
    </div>
  );
}
