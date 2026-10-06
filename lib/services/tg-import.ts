// One-off import of the course chat history (Telegram Desktop export) through the usual intake
// with auto-sorting. A dry run only reads the schedule and reports what would happen.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups, media, subjects } from "@/lib/db/schema";
import { extensionOf } from "@/lib/ingest/detect";
import { ingest, type IngestTarget } from "@/lib/ingest/ingest";
import {
  batches,
  decideBatch,
  forReview,
  type Decision,
  type SortContext,
} from "@/lib/ingest/sort";
import type { TgExportItem } from "@/lib/ingest/tg-export";
import { getCurrentSemester, loadScheduleData } from "./schedule";

const PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

/** Photo or document, by name (the sorting rules differ; the intake checks the bytes). */
export const guessKind = (fileName: string): "photo" | "file" =>
  PHOTO_EXTENSIONS.has(extensionOf(fileName)) ? "photo" : "file";

export async function loadSortContext(): Promise<SortContext | null> {
  const [data, semester] = await Promise.all([loadScheduleData(), getCurrentSemester()]);
  if (!data || !semester) return null;
  const [subjectRows, groupRows] = await Promise.all([
    db().select().from(subjects).where(eq(subjects.semesterId, semester.id)),
    db().select({ id: groups.id }).from(groups).where(eq(groups.isEnabled, true)),
  ]);
  return {
    data,
    groupIds: groupRows.map((g) => g.id),
    subjects: subjectRows
      .filter((s) => s.name !== "Самостоятельная работа")
      .map((s) => ({ id: s.id, name: s.name, shortName: s.shortName, aliases: s.aliases })),
  };
}

export interface PlannedItem {
  item: TgExportItem;
  kind: "photo" | "file";
  decision: Decision;
}

/**
 * Decisions for every item; batches share their captions. Items from `reviewTopics`
 * (announcements) all go to «Неразобранное» with the would-be decision as the hint.
 */
export function planImport(
  items: TgExportItem[],
  ctx: SortContext,
  { reviewTopics = new Set<number>() }: { reviewTopics?: Set<number> } = {},
): PlannedItem[] {
  const sortItems = items.map((item) => ({
    kind: guessKind(item.fileName),
    caption: item.caption,
    fileName: item.fileName,
    postedAt: item.postedAt,
    authorId: item.authorId,
    mediaGroupId: null,
  }));
  const planned: PlannedItem[] = [];
  for (const batch of batches(sortItems)) {
    const decisions = decideBatch(
      batch.map((i) => sortItems[i]!),
      ctx,
    );
    batch.forEach((i, k) => {
      const item = items[i]!;
      const decision = reviewTopics.has(item.topicId) ? forReview(decisions[k]!) : decisions[k]!;
      planned.push({ item, kind: sortItems[i]!.kind, decision });
    });
  }
  return planned.sort((a, b) => +a.item.postedAt - +b.item.postedAt);
}

export interface ImportReport {
  total: number;
  toLessons: number;
  toMaterials: number;
  unsorted: number;
  alreadyImported: number;
  bySubject: Record<string, number>;
  unsortedReasons: Record<string, number>;
}

/** What the import would do (or did): counts by outcome, subject and reason. */
export async function reportPlan(
  planned: PlannedItem[],
  ctx: SortContext,
  chatId: number,
): Promise<ImportReport> {
  const known = new Set<number>();
  const ids = planned.map((p) => p.item.messageId);
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db()
      .select({ id: media.tgMessageId })
      .from(media)
      .where(and(eq(media.tgChatId, chatId), inArray(media.tgMessageId, ids.slice(i, i + 500))));
    for (const r of rows) if (r.id !== null) known.add(r.id);
  }
  const name = (id: string | null) => ctx.subjects.find((s) => s.id === id)?.name ?? "—";
  const report: ImportReport = {
    total: planned.length,
    toLessons: 0,
    toMaterials: 0,
    unsorted: 0,
    alreadyImported: 0,
    bySubject: {},
    unsortedReasons: {},
  };
  for (const { item, decision } of planned) {
    if (known.has(item.messageId)) {
      report.alreadyImported++;
      continue;
    }
    if (decision.status === "unsorted") {
      report.unsorted++;
      const reason = decision.reason.replace(/:.*$/, "");
      report.unsortedReasons[reason] = (report.unsortedReasons[reason] ?? 0) + 1;
      continue;
    }
    const subjectId = "lesson" in decision ? decision.lesson.subjectId : decision.materialsOf;
    if ("lesson" in decision) report.toLessons++;
    else report.toMaterials++;
    report.bySubject[name(subjectId)] = (report.bySubject[name(subjectId)] ?? 0) + 1;
  }
  return report;
}

export function targetFor(decision: Decision): IngestTarget {
  if (decision.status === "unsorted")
    return { type: "unsorted", suggestion: decision.suggestion, reason: decision.reason };
  if ("materialsOf" in decision) return { type: "materials", subjectId: decision.materialsOf };
  const l = decision.lesson;
  return {
    type: "lesson",
    subjectId: l.subjectId,
    date: l.date,
    slotN: l.slotN,
    startsAt: l.startsAt,
    kind: l.kind,
  };
}

/** Runs the planned items through the intake; repeated runs skip what is already there. */
export async function applyImport(
  folder: string,
  chatId: number,
  planned: PlannedItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<"created" | "duplicate" | "rejected" | "missing", number>> {
  const counts = { created: 0, duplicate: 0, rejected: 0, missing: 0 };
  let done = 0;
  for (const { item, decision } of planned) {
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(folder, item.path));
    } catch {
      counts.missing++;
      continue;
    }
    const result = await ingest({
      bytes,
      fileName: item.fileName,
      target: targetFor(decision),
      uploaderId: null,
      source: "tg_import",
      postedAt: item.postedAt,
      telegram: {
        chatId,
        messageId: item.messageId,
        threadId: item.topicId,
        mediaGroupId: null,
        authorId: item.authorId,
        authorName: item.authorName,
        caption: item.caption || null,
      },
    });
    counts[result.status]++;
    onProgress?.(++done, planned.length);
  }
  return counts;
}
