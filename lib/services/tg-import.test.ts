import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import {
  groups,
  lessonNotes,
  media,
  scheduleEntries,
  scheduleEntryGroups,
  semesters,
  subjects,
  timeSlots,
} from "@/lib/db/schema";
import { parseExport } from "@/lib/ingest/tg-export";
import { setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { applyImport, loadSortContext, planImport, reportPlan } from "./tg-import";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;
let exportDir: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-tg-storage-"));
  exportDir = await mkdtemp(path.join(tmpdir(), "para-tg-export-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await rm(exportDir, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

const unix = (msk: string) => String(Date.parse(`${msk}+03:00`) / 1000);
const OURS = 16;

async function setup() {
  await db.insert(timeSlots).values({ n: 2, startsAt: "10:10", endsAt: "11:40" });
  const [group] = await db.insert(groups).values({ code: "ИУ8-12М" }).returning();
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [zis, mlita] = await db
    .insert(subjects)
    .values([
      { semesterId: semester!.id, name: "Защищённые информационные системы", shortName: "ЗИС" },
      { semesterId: semester!.id, name: "Математическая логика", shortName: "МЛиТА" },
    ])
    .returning();
  const [entry] = await db
    .insert(scheduleEntries)
    .values({ subjectId: zis!.id, weekday: 3, slotN: 2, kind: "seminar" })
    .returning();
  await db.insert(scheduleEntryGroups).values({ entryId: entry!.id, groupId: group!.id });

  await mkdir(path.join(exportDir, "photos"), { recursive: true });
  await mkdir(path.join(exportDir, "files"), { recursive: true });
  const photo = (r: number) =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: { r, g: 0, b: 0 } } })
      .jpeg()
      .toBuffer();
  await writeFile(path.join(exportDir, "photos/a.jpg"), await photo(10));
  await writeFile(path.join(exportDir, "photos/b.jpg"), await photo(200));
  await writeFile(path.join(exportDir, "files/q.pdf"), Buffer.from("%PDF-1.4 fake"));
  const raw = {
    id: 4278419875,
    messages: [
      { id: 16, type: "service", action: "topic_created", title: "11М и 12М" },
      // Wednesday 30.09, during ЗИС (10:10–11:40).
      {
        id: 100,
        type: "message",
        date_unixtime: unix("2026-09-30T10:40:00"),
        from: "Яна",
        from_id: "user1",
        reply_to_message_id: OURS,
        photo: "photos/a.jpg",
        text: "",
      },
      // The same evening, another author: not during a lesson.
      {
        id: 101,
        type: "message",
        date_unixtime: unix("2026-09-30T20:00:00"),
        from_id: "user2",
        reply_to_message_id: OURS,
        photo: "photos/b.jpg",
        text: "",
      },
      // A file named by its caption → «Материалы» of МЛиТА.
      {
        id: 102,
        type: "message",
        date_unixtime: unix("2026-10-01T21:00:00"),
        from_id: "user3",
        reply_to_message_id: OURS,
        file: "files/q.pdf",
        file_name: "q.pdf",
        text: "Вопросы к РК по МЛиТА",
      },
    ],
  };
  return { zis: zis!.id, mlita: mlita!.id, raw };
}

describe("Telegram import", () => {
  it("dry run reports, apply sorts, a second run adds nothing", async () => {
    const s = await setup();
    const parsed = parseExport(s.raw, {
      topics: new Set([OURS]),
      since: new Date("2026-08-31T00:00:00+03:00"),
    });
    const ctx = (await loadSortContext())!;
    const planned = planImport(parsed.items, ctx);
    expect(await reportPlan(planned, ctx, parsed.chatId)).toMatchObject({
      total: 3,
      toLessons: 1,
      toMaterials: 1,
      unsorted: 1,
      alreadyImported: 0,
    });
    expect(await db.select().from(media)).toHaveLength(0); // the dry run wrote nothing

    expect(await applyImport(exportDir, parsed.chatId, planned)).toEqual({
      created: 3,
      duplicate: 0,
      rejected: 0,
      missing: 0,
    });
    const rows = await db.select().from(media);
    const byMessage = new Map(rows.map((r) => [r.tgMessageId, r]));
    const [note] = await db.select().from(lessonNotes);
    expect(byMessage.get(100)).toMatchObject({
      status: "sorted",
      subjectId: s.zis,
      lessonNoteId: note!.id,
      source: "tg_import",
      tgAuthorName: "Яна",
      tgChatId: -1004278419875,
      sortedBy: null,
    });
    expect(note).toMatchObject({ date: "2026-09-30", slotN: 2 });
    expect(byMessage.get(101)).toMatchObject({
      status: "unsorted",
      subjectId: null,
      suggestedSubjectId: s.zis,
      suggestedLessonDate: "2026-09-30",
      suggestedSlotN: 2,
    });
    expect(byMessage.get(102)).toMatchObject({
      status: "sorted",
      subjectId: s.mlita,
      lessonNoteId: null,
      caption: "Вопросы к РК по МЛиТА",
    });

    // Deleted as not study-related: a repeated import must not bring it back.
    await db.update(media).set({ deletedAt: new Date() }).where(eq(media.tgMessageId, 101));
    expect(await reportPlan(planned, ctx, parsed.chatId)).toMatchObject({ alreadyImported: 3 });
    expect(await applyImport(exportDir, parsed.chatId, planned)).toMatchObject({
      created: 0,
      duplicate: 3,
    });
  });
});
