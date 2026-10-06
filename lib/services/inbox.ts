// «Неразобранное» and «Разложено автоматически»: photos/files from the chat that staff check.
import { and, count, desc, asc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { auditLog, lessonNotes, media, subjects } from "@/lib/db/schema";
import { lessonNoteFor } from "@/lib/ingest/ingest";
import { lessonsBetween, type LessonRef } from "@/lib/ingest/sort";
import { addDays, type IsoDate } from "@/lib/schedule/dates";
import { isoDate, lessonKind } from "@/lib/schedule/inputs";
import { loadSortContext } from "./tg-import";
import type { User } from "./users";

type Actor = Pick<User, "id" | "role">;
const isStaff = (actor: Actor) => actor.role === "starosta" || actor.role === "admin";
export type Result = { ok: true } | { ok: false; error: string };

export interface InboxItem {
  id: string;
  kind: "photo" | "file";
  fileName: string;
  title: string | null;
  postedAt: Date;
  authorName: string | null;
  authorId: number | null;
  caption: string | null;
  /** Unsorted: the hint. Auto-sorted: where it went. */
  subjectId: string | null;
  subjectName: string | null;
  date: IsoDate | null;
  slotN: number | null;
  reason: string | null;
}

const fromChat = inArray(media.source, ["tg_import", "tg_bot"]);

export async function inboxCounts(): Promise<{ unsorted: number; auto: number }> {
  const [[unsorted], [auto]] = await Promise.all([
    db()
      .select({ n: count() })
      .from(media)
      .where(and(eq(media.status, "unsorted"), isNull(media.deletedAt))),
    db()
      .select({ n: count() })
      .from(media)
      .where(
        and(eq(media.status, "sorted"), isNull(media.sortedBy), fromChat, isNull(media.deletedAt)),
      ),
  ]);
  return { unsorted: unsorted?.n ?? 0, auto: auto?.n ?? 0 };
}

const base = {
  id: media.id,
  kind: media.kind,
  fileName: media.fileName,
  title: media.title,
  postedAt: media.postedAt,
  authorName: media.tgAuthorName,
  authorId: media.tgAuthorId,
  caption: media.caption,
};

/** Oldest first: sorting goes through the semester in order. */
export async function listUnsorted(limit = 600): Promise<InboxItem[]> {
  const rows = await db()
    .select({
      ...base,
      subjectId: media.suggestedSubjectId,
      subjectName: subjects.name,
      date: media.suggestedLessonDate,
      slotN: media.suggestedSlotN,
      reason: media.suggestionReason,
    })
    .from(media)
    .leftJoin(subjects, eq(subjects.id, media.suggestedSubjectId))
    .where(and(eq(media.status, "unsorted"), isNull(media.deletedAt)))
    .orderBy(asc(media.postedAt))
    .limit(limit);
  return rows;
}

/** Newest first: what the robot put where, for spot checks. */
export async function listAutoSorted(limit = 300): Promise<InboxItem[]> {
  const rows = await db()
    .select({
      ...base,
      subjectId: media.subjectId,
      subjectName: subjects.name,
      date: lessonNotes.date,
      slotN: lessonNotes.slotN,
    })
    .from(media)
    .leftJoin(subjects, eq(subjects.id, media.subjectId))
    .leftJoin(lessonNotes, eq(lessonNotes.id, media.lessonNoteId))
    .where(
      and(eq(media.status, "sorted"), isNull(media.sortedBy), fromChat, isNull(media.deletedAt)),
    )
    .orderBy(desc(media.postedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, reason: null }));
}

/** Lessons around the given dates (±3 days): choices for «к паре». */
export async function lessonChoices(dates: IsoDate[]): Promise<LessonRef[]> {
  const ctx = await loadSortContext();
  if (!ctx || dates.length === 0) return [];
  const sorted = [...dates].sort();
  return lessonsBetween(
    ctx.data,
    addDays(sorted[0]!, -3),
    addDays(sorted.at(-1)!, 3),
    ctx.groupIds,
  );
}

export const sortTarget = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lesson"),
    subjectId: z.uuid(),
    date: isoDate,
    slotN: z.number().int().min(1).max(12).nullable(),
    startsAt: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    kind: lessonKind.nullable(),
  }),
  z.object({ type: z.literal("materials"), subjectId: z.uuid() }),
]);
export type SortTarget = z.infer<typeof sortTarget>;

const ids = z.array(z.uuid()).min(1, "Ничего не выбрано").max(600);

/** Puts the chosen items into a lesson or the subject's materials (marked as sorted by hand). */
export async function sortItems(
  actor: Actor,
  rawIds: unknown,
  rawTarget: unknown,
): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Разбирают только старосты" };
  const parsedIds = ids.safeParse(rawIds);
  const target = sortTarget.safeParse(rawTarget);
  if (!parsedIds.success || !target.success) return { ok: false, error: "Проверьте выбор" };
  const t = target.data;

  const lessonNoteId =
    t.type === "lesson"
      ? await lessonNoteFor({
          type: "lesson",
          subjectId: t.subjectId,
          date: t.date,
          slotN: t.slotN,
          startsAt: t.startsAt,
          kind: t.kind,
        })
      : null;
  const [last] = await db()
    .select({ sort: max(media.sort) })
    .from(media)
    .where(lessonNoteId ? eq(media.lessonNoteId, lessonNoteId) : eq(media.subjectId, t.subjectId));
  // Keep the chat order inside the lesson.
  const rows = await db()
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, parsedIds.data), isNull(media.deletedAt)))
    .orderBy(asc(media.postedAt));
  let sort = (last?.sort ?? -1) + 1;
  for (const row of rows) {
    await db()
      .update(media)
      .set({
        status: "sorted",
        subjectId: t.subjectId,
        lessonNoteId,
        sort: sort++,
        sortedBy: actor.id,
        sortedAt: new Date(),
        suggestedSubjectId: null,
        suggestedLessonDate: null,
        suggestedSlotN: null,
        suggestionReason: null,
      })
      .where(eq(media.id, row.id));
  }
  await db()
    .insert(auditLog)
    .values({
      actorId: actor.id,
      action: "media.sort",
      entity: "media",
      entityId: null,
      payload: { ids: rows.map((r) => r.id), target: t },
    });
  return { ok: true };
}

/** Not study-related: removed from the site (a repeated import will not bring it back). */
export async function deleteItems(actor: Actor, rawIds: unknown): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Удалять могут только старосты" };
  const parsed = ids.safeParse(rawIds);
  if (!parsed.success) return { ok: false, error: "Ничего не выбрано" };
  await db()
    .update(media)
    .set({ deletedAt: new Date() })
    .where(
      and(inArray(media.id, parsed.data), isNull(media.deletedAt), ne(media.source, "upload")),
    );
  await db()
    .insert(auditLog)
    .values({
      actorId: actor.id,
      action: "media.delete",
      entity: "media",
      entityId: null,
      payload: { ids: parsed.data },
    });
  return { ok: true };
}
