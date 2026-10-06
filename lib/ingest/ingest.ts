// One intake for every photo/file: site uploads now, Telegram import and the bot later (M5).
import { createHash } from "node:crypto";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lessonNotes, media } from "@/lib/db/schema";
import type { IsoDate } from "@/lib/schedule/dates";
import type { LessonKind } from "@/lib/schedule/types";
import { deleteObject, newKey, writeObject } from "@/lib/storage/disk";
import { detectUpload, safeFileName } from "./detect";
import { heavyJob } from "./limit";
import { pdfPageCount } from "./pdf";
import { processPhoto } from "./photo";

export type IngestTarget =
  | {
      type: "lesson";
      subjectId: string;
      date: IsoDate;
      slotN: number | null;
      startsAt: string | null; // for lessons outside the bell grid
      kind: LessonKind | null;
      title?: string | null; // topic of the lesson, set if the note has none yet
    }
  | { type: "materials"; subjectId: string };

export interface IngestInput {
  bytes: Uint8Array;
  fileName: string;
  target: IngestTarget;
  uploaderId: string | null;
  source?: "upload" | "tg_import" | "tg_bot";
  postedAt?: Date;
}

export type IngestResult =
  | { status: "created"; mediaId: string; kind: "photo" | "file"; lessonNoteId: string | null }
  | { status: "duplicate"; mediaId: string }
  | { status: "rejected"; error: string };

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function findBySha(hash: string) {
  const [row] = await db()
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.sha256, hash), isNull(media.deletedAt)));
  return row;
}

/** The library «занятие» for a lesson, created on first upload. */
async function lessonNoteFor(target: Extract<IngestTarget, { type: "lesson" }>): Promise<string> {
  const key = {
    subjectId: target.subjectId,
    date: target.date,
    slotN: target.slotN,
    startsAt: target.slotN === null ? target.startsAt : null,
  };
  const title = target.title?.trim() || null;
  const [created] = await db()
    .insert(lessonNotes)
    .values({ ...key, kind: target.kind, title })
    .onConflictDoNothing()
    .returning({ id: lessonNotes.id });
  if (created) return created.id;

  const [existing] = await db()
    .select({ id: lessonNotes.id, title: lessonNotes.title })
    .from(lessonNotes)
    .where(
      and(
        eq(lessonNotes.subjectId, key.subjectId),
        eq(lessonNotes.date, key.date),
        key.slotN === null ? isNull(lessonNotes.slotN) : eq(lessonNotes.slotN, key.slotN),
        key.startsAt === null
          ? isNull(lessonNotes.startsAt)
          : eq(lessonNotes.startsAt, key.startsAt),
      ),
    );
  if (!existing) throw new Error("lesson note vanished");
  if (title && !existing.title) {
    await db().update(lessonNotes).set({ title }).where(eq(lessonNotes.id, existing.id));
  }
  return existing.id;
}

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const detected = detectUpload(input.bytes, input.fileName);
  if (detected.kind === "rejected") return { status: "rejected", error: detected.reason };

  const hash = sha256(input.bytes);
  const duplicate = await findBySha(hash);
  if (duplicate) return { status: "duplicate", mediaId: duplicate.id };

  const fileName = safeFileName(input.fileName);
  const written: string[] = [];
  try {
    let row: Omit<typeof media.$inferInsert, "status" | "source" | "postedAt" | "sha256">;
    if (detected.kind === "photo") {
      const photo = await heavyJob(() => processPhoto(input.bytes, detected.format)).catch(
        () => null,
      );
      if (!photo) return { status: "rejected", error: "Не удалось прочитать фото" };
      const key = newKey("media");
      await writeObject(`${key}.webp`, photo.full);
      written.push(`${key}.webp`);
      await writeObject(`${key}_480.webp`, photo.preview);
      written.push(`${key}_480.webp`);
      row = {
        kind: "photo",
        storageKey: `${key}.webp`,
        previewKey: `${key}_480.webp`,
        fileName: fileName.replace(/\.[^.]+$/, "") + ".webp",
        mime: "image/webp",
        sizeBytes: photo.full.length,
        width: photo.width,
        height: photo.height,
      };
    } else {
      const pageCount =
        detected.extension === "pdf" ? await heavyJob(() => pdfPageCount(input.bytes)) : null;
      const key = `${newKey("files")}-${fileName}`;
      await writeObject(key, input.bytes);
      written.push(key);
      row = {
        kind: "file",
        storageKey: key,
        fileName,
        pageCount,
        mime: detected.mime,
        sizeBytes: input.bytes.length,
      };
    }

    const lessonNoteId = input.target.type === "lesson" ? await lessonNoteFor(input.target) : null;
    const [last] = await db()
      .select({ sort: max(media.sort) })
      .from(media)
      .where(lessonNoteId ? eq(media.lessonNoteId, lessonNoteId) : sql`false`);

    const [created] = await db()
      .insert(media)
      .values({
        ...row,
        status: "sorted",
        subjectId: input.target.subjectId,
        lessonNoteId,
        sha256: hash,
        sort: (last?.sort ?? -1) + 1,
        source: input.source ?? "upload",
        uploaderId: input.uploaderId,
        postedAt: input.postedAt ?? new Date(),
        sortedBy: input.uploaderId,
        sortedAt: new Date(),
      })
      .returning({ id: media.id });
    return { status: "created", mediaId: created!.id, kind: detected.kind, lessonNoteId };
  } catch (error) {
    await Promise.all(written.map((key) => deleteObject(key)));
    // Two people uploading the same file at once: the unique index decides.
    const existing = await findBySha(hash);
    if (existing) return { status: "duplicate", mediaId: existing.id };
    throw error;
  }
}
