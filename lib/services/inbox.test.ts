import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { lessonNotes, media, semesters, subjects, timeSlots, users } from "@/lib/db/schema";
import { ingest } from "@/lib/ingest/ingest";
import { setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { deleteItems, inboxCounts, listAutoSorted, listUnsorted, sortItems } from "./inbox";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-inbox-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

const photo = (r: number) =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: { r, g: 1, b: 1 } } })
    .png()
    .toBuffer();

async function setup() {
  await db.insert(timeSlots).values({ n: 2, startsAt: "10:10", endsAt: "11:40" });
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [zis] = await db
    .insert(subjects)
    .values({ semesterId: semester!.id, name: "ЗИС" })
    .returning();
  const student = await upsertTelegramUser(db, { id: 1, firstName: "Аня" }, { grantAccess: true });
  const [starosta] = await db
    .update(users)
    .set({ role: "starosta" })
    .where(
      eq(
        users.id,
        (await upsertTelegramUser(db, { id: 2, firstName: "Катя" }, { grantAccess: true })).id,
      ),
    )
    .returning();
  const fromChat = async (messageId: number, r: number) => {
    const result = await ingest({
      bytes: await photo(r),
      fileName: `p${messageId}.png`,
      target: {
        type: "unsorted",
        suggestion: { subjectId: zis!.id, date: "2026-09-30", slotN: 2 },
        reason: "после пары: ЗИС",
      },
      uploaderId: null,
      source: "tg_import",
      postedAt: new Date("2026-09-30T17:00:00Z"),
      telegram: {
        chatId: -100,
        messageId,
        threadId: 16,
        mediaGroupId: null,
        authorId: 7,
        authorName: "Яна",
        caption: null,
      },
    });
    return result.status === "created" ? result.mediaId : "";
  };
  return {
    zis: zis!.id,
    student,
    starosta: starosta!,
    a: await fromChat(1, 10),
    b: await fromChat(2, 120),
    c: await fromChat(3, 230),
  };
}

describe("inbox", () => {
  it("staff put chosen photos into a lesson, delete the rest", async () => {
    const s = await setup();
    expect(await inboxCounts()).toEqual({ unsorted: 3, auto: 0 });
    expect((await listUnsorted())[0]).toMatchObject({
      authorName: "Яна",
      subjectName: "ЗИС",
      date: "2026-09-30",
      slotN: 2,
      reason: "после пары: ЗИС",
    });

    const target = {
      type: "lesson",
      subjectId: s.zis,
      date: "2026-09-30",
      slotN: 2,
      startsAt: null,
      kind: "seminar",
    };
    expect((await sortItems(s.student, [s.a, s.b], target)).ok).toBe(false);
    expect(await sortItems(s.starosta, [s.a, s.b], target)).toEqual({ ok: true });
    const [note] = await db.select().from(lessonNotes);
    const sorted = await db.select().from(media).where(eq(media.lessonNoteId, note!.id));
    expect(sorted.map((m) => [m.status, m.sortedBy, m.suggestionReason])).toEqual([
      ["sorted", s.starosta.id, null],
      ["sorted", s.starosta.id, null],
    ]);

    expect((await deleteItems(s.student, [s.c])).ok).toBe(false);
    expect(await deleteItems(s.starosta, [s.c])).toEqual({ ok: true });
    expect(await inboxCounts()).toEqual({ unsorted: 0, auto: 0 });
    // Sorted by hand: not in «Разложено автоматически».
    expect(await listAutoSorted()).toEqual([]);
  });

  it("materials of a subject", async () => {
    const s = await setup();
    await sortItems(s.starosta, [s.a], { type: "materials", subjectId: s.zis });
    const [row] = await db.select().from(media).where(eq(media.id, s.a));
    expect(row).toMatchObject({ status: "sorted", subjectId: s.zis, lessonNoteId: null });
  });
});
