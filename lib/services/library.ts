// Library reads and edits: lessons with photos/files, subject materials, rename/delete.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, lessonNotes, media, subjects, users } from "@/lib/db/schema";
import type { IsoDate } from "@/lib/schedule/dates";
import { shortTime } from "@/lib/schedule/dates";
import type { LessonKind } from "@/lib/schedule/types";
import { readFile } from "node:fs/promises";
import { isFaxScan, pdfPageCount } from "@/lib/ingest/pdf";
import { uploadLessons } from "@/lib/ingest/targets";
import { objectPath } from "@/lib/storage/disk";
import { todayInMoscow } from "@/lib/schedule/dates";
import { nowInMoscow } from "@/lib/time";
import { getCurrentSemester, loadScheduleData } from "./schedule";
import type { User } from "./users";

export type Result = { ok: true } | { ok: false; error: string };
type Actor = Pick<User, "id" | "role">;
const isStaff = (actor: Actor) => actor.role === "starosta" || actor.role === "admin";

export interface LibraryItem {
  id: string;
  kind: "photo" | "file";
  fileName: string;
  title: string | null;
  mime: string;
  sizeBytes: number;
  pageCount: number | null;
  width: number | null;
  height: number | null;
  uploaderId: string | null;
  uploaderName: string | null;
  createdAt: Date;
  lessonNoteId: string | null;
}

export interface LibraryNote {
  id: string;
  date: IsoDate;
  slotN: number | null;
  startsAt: string | null;
  kind: LessonKind | null;
  title: string | null;
  items: LibraryItem[];
}

export interface SubjectSummary {
  id: string;
  name: string;
  shortName: string | null;
  photos: number;
  files: number;
}

const itemColumns = {
  id: media.id,
  kind: media.kind,
  fileName: media.fileName,
  title: media.title,
  mime: media.mime,
  sizeBytes: media.sizeBytes,
  pageCount: media.pageCount,
  width: media.width,
  height: media.height,
  uploaderId: media.uploaderId,
  uploaderName: users.displayName,
  createdAt: media.createdAt,
  lessonNoteId: media.lessonNoteId,
};

/** Subjects of the current semester with photo/file counts (self-study excluded). */
export async function listSubjectsWithCounts(): Promise<SubjectSummary[]> {
  const semester = await getCurrentSemester();
  if (!semester) return [];
  const rows = await db()
    .select({
      id: subjects.id,
      name: subjects.name,
      shortName: subjects.shortName,
      photos: sql<number>`count(${media.id}) filter (where ${media.kind} = 'photo')`.mapWith(
        Number,
      ),
      files: sql<number>`count(${media.id}) filter (where ${media.kind} = 'file')`.mapWith(Number),
    })
    .from(subjects)
    .leftJoin(
      media,
      and(eq(media.subjectId, subjects.id), eq(media.status, "sorted"), isNull(media.deletedAt)),
    )
    .where(
      and(eq(subjects.semesterId, semester.id), sql`${subjects.name} <> 'Самостоятельная работа'`),
    )
    .groupBy(subjects.id)
    .orderBy(asc(subjects.name));
  return rows;
}

export async function getSubject(id: string) {
  const [subject] = await db().select().from(subjects).where(eq(subjects.id, id));
  return subject;
}

export type LessonFilter = "all" | "lecture" | "seminar";

/** Lessons (newest first) with their photos and files, plus subject materials. */
export async function subjectLibrary(
  subjectId: string,
  { filter = "all", q = "" }: { filter?: LessonFilter; q?: string } = {},
): Promise<{ notes: LibraryNote[]; materials: LibraryItem[] }> {
  const needle = q.trim().toLowerCase();

  const noteRows = await db()
    .select()
    .from(lessonNotes)
    .where(
      and(
        eq(lessonNotes.subjectId, subjectId),
        filter === "lecture" ? eq(lessonNotes.kind, "lecture") : undefined,
        filter === "seminar"
          ? inArray(lessonNotes.kind, ["seminar", "practice", "lab"])
          : undefined,
      ),
    )
    .orderBy(desc(lessonNotes.date), desc(lessonNotes.slotN));

  const items = await db()
    .select(itemColumns)
    .from(media)
    .leftJoin(users, eq(users.id, media.uploaderId))
    .where(and(eq(media.subjectId, subjectId), eq(media.status, "sorted"), isNull(media.deletedAt)))
    .orderBy(asc(media.sort), asc(media.createdAt));

  // A semester has at most a few hundred items per subject, so filtering in memory is fine.
  const matches = (text: string | null | undefined) =>
    !needle || (text ?? "").toLowerCase().includes(needle);

  const notes = noteRows
    .map((note) => {
      const noteItems = items.filter((i) => i.lessonNoteId === note.id);
      const visible = matches(note.title)
        ? noteItems
        : noteItems.filter((i) => matches(i.title) || matches(i.fileName));
      return {
        id: note.id,
        date: note.date,
        slotN: note.slotN,
        startsAt: note.startsAt ? shortTime(note.startsAt) : null,
        kind: note.kind,
        title: note.title,
        items: visible,
      };
    })
    .filter((note) => note.items.length > 0);

  const materials = items
    .filter((i) => i.lessonNoteId === null && (matches(i.title) || matches(i.fileName)))
    .reverse(); // newest first
  return { notes, materials };
}

/** Photo/file counts per lesson for schedule cards. Key: lessonKey() from lib/ingest/targets. */
export async function noteCounts(
  from: IsoDate,
  to: IsoDate,
): Promise<Map<string, { noteId: string; photos: number; files: number }>> {
  const rows = await db()
    .select({
      noteId: lessonNotes.id,
      subjectId: lessonNotes.subjectId,
      date: lessonNotes.date,
      slotN: lessonNotes.slotN,
      startsAt: lessonNotes.startsAt,
      photos: sql<number>`count(${media.id}) filter (where ${media.kind} = 'photo')`.mapWith(
        Number,
      ),
      files: sql<number>`count(${media.id}) filter (where ${media.kind} = 'file')`.mapWith(Number),
    })
    .from(lessonNotes)
    .innerJoin(media, and(eq(media.lessonNoteId, lessonNotes.id), isNull(media.deletedAt)))
    .where(and(gte(lessonNotes.date, from), lte(lessonNotes.date, to)))
    .groupBy(lessonNotes.id);
  return new Map(
    rows.map((r) => [
      `${r.subjectId}|${r.date}|${r.slotN ?? `@${r.startsAt ? shortTime(r.startsAt) : ""}`}`,
      { noteId: r.noteId, photos: r.photos, files: r.files },
    ]),
  );
}

/** For serving files: only existing, not deleted media. */
/** A file anyone with access may open; unsorted ones («Неразобранное») only for staff. */
export async function getServableMedia(id: string, viewer?: Actor) {
  const [row] = await db()
    .select()
    .from(media)
    .where(
      and(
        eq(media.id, id),
        isNull(media.deletedAt),
        viewer && isStaff(viewer) ? undefined : isNotNull(media.subjectId),
      ),
    );
  return row;
}

async function loadEditable(
  actor: Actor,
  mediaId: string,
): Promise<{ ok: false; error: string } | { ok: true; row: typeof media.$inferSelect }> {
  const [row] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), isNull(media.deletedAt)));
  if (!row) return { ok: false, error: "Файл не найден" };
  if (!isStaff(actor) && row.uploaderId !== actor.id) {
    return { ok: false, error: "Можно менять только свои загрузки" };
  }
  return { ok: true, row };
}

/** Own uploads, or anything for starostas. Soft delete: the file stays on disk until backups rotate. */
export async function deleteMedia(actor: Actor, mediaId: string): Promise<Result> {
  const found = await loadEditable(actor, mediaId);
  if (!found.ok) return found;
  await db().update(media).set({ deletedAt: new Date() }).where(eq(media.id, mediaId));
  await db()
    .insert(auditLog)
    .values({
      actorId: actor.id,
      action: "media.delete",
      entity: "media",
      entityId: mediaId,
      payload: { fileName: found.row.fileName },
    });
  return { ok: true };
}

export async function renameMedia(actor: Actor, mediaId: string, title: string): Promise<Result> {
  const found = await loadEditable(actor, mediaId);
  if (!found.ok) return found;
  const clean = title.trim().slice(0, 200) || null;
  await db().update(media).set({ title: clean }).where(eq(media.id, mediaId));
  return { ok: true };
}

/** Topic of a lesson: starostas, or anyone who uploaded to it. */
export async function setNoteTitle(actor: Actor, noteId: string, title: string): Promise<Result> {
  if (!isStaff(actor)) {
    const [own] = await db()
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.lessonNoteId, noteId), eq(media.uploaderId, actor.id)))
      .limit(1);
    if (!own) return { ok: false, error: "Тему занятия может поправить староста" };
  }
  await db()
    .update(lessonNotes)
    .set({ title: title.trim().slice(0, 200) || null })
    .where(eq(lessonNotes.id, noteId));
  return { ok: true };
}

/** Options for the upload sheet: last week's lessons (default = current one) and subjects. */
export async function getUploadOptions(groupId: string) {
  const data = await loadScheduleData();
  if (!data) return { lessons: [], subjects: [], defaultLessonKey: null };
  const now = nowInMoscow();
  const { lessons, defaultKey } = uploadLessons(
    data,
    groupId,
    todayInMoscow(),
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  );
  return {
    lessons: lessons.map((l) => ({
      key: l.key,
      subjectId: l.subjectId,
      subjectName: l.subjectName,
      date: l.date,
      slotN: l.slotN,
      start: l.time.start,
      kind: l.kind,
    })),
    subjects: [...data.subjects.values()]
      .filter((s) => s.name !== "Самостоятельная работа")
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .map((s) => ({ id: s.id, name: s.name })),
    defaultLessonKey: defaultKey,
  };
}

/**
 * How to show a PDF (or the PDF copy of an Office/DjVu file): page count and whether pages
 * must be rendered on the server. Files uploaded before these fields existed are checked once.
 */
export async function pdfViewInfo(
  item: typeof media.$inferSelect,
  source: "original" | "copy",
): Promise<{ pageCount: number | null; serverPages: boolean }> {
  if (item.serverPages !== null && item.pageCount !== null) {
    return { pageCount: item.pageCount, serverPages: item.serverPages };
  }
  const key = source === "copy" ? item.viewKey : item.storageKey;
  if (!key) return { pageCount: item.pageCount, serverPages: false };
  const bytes = await readFile(objectPath(key));
  const info = {
    pageCount: item.pageCount ?? (await pdfPageCount(bytes)),
    serverPages: isFaxScan(bytes),
  };
  await db().update(media).set(info).where(eq(media.id, item.id));
  return info;
}
