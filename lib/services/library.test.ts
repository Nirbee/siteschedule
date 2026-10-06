import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { semesters, subjects, timeSlots, users } from "@/lib/db/schema";
import { ingest } from "@/lib/ingest/ingest";
import { setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { eq } from "drizzle-orm";
import {
  deleteMedia,
  getServableMedia,
  listSubjectsWithCounts,
  noteCounts,
  renameMedia,
  setNoteTitle,
  subjectLibrary,
} from "./library";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-library-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

const photo = (seed: number) =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r: seed, g: 10, b: 10 } } })
    .png()
    .toBuffer();

async function setup() {
  await db.insert(timeSlots).values({ n: 5, startsAt: "15:55", endsAt: "17:25" });
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [op, self] = await db
    .insert(subjects)
    .values([
      { semesterId: semester!.id, name: "Основы предпринимательства" },
      { semesterId: semester!.id, name: "Самостоятельная работа" },
    ])
    .returning();
  const anya = await upsertTelegramUser(db, { id: 1, firstName: "Аня" }, { grantAccess: true });
  const boris = await upsertTelegramUser(db, { id: 2, firstName: "Борис" }, { grantAccess: true });
  const [katya] = await db
    .update(users)
    .set({ role: "starosta" })
    .where(
      eq(
        users.id,
        (await upsertTelegramUser(db, { id: 3, firstName: "Катя" }, { grantAccess: true })).id,
      ),
    )
    .returning();

  const lesson = {
    type: "lesson" as const,
    subjectId: op!.id,
    date: "2026-09-30",
    slotN: 5,
    startsAt: null,
    kind: "lecture" as const,
    title: "Создание ООО",
  };
  const p1 = await ingest({
    bytes: await photo(1),
    fileName: "1.png",
    target: lesson,
    uploaderId: anya.id,
  });
  const p2 = await ingest({
    bytes: await photo(200),
    fileName: "2.png",
    target: lesson,
    uploaderId: anya.id,
  });
  const file = await ingest({
    bytes: Buffer.from("%PDF-1.4 fake"),
    fileName: "Unknown 7.pdf",
    target: { type: "materials", subjectId: op!.id },
    uploaderId: boris.id,
  });
  const id = (r: Awaited<ReturnType<typeof ingest>>) => (r.status === "created" ? r.mediaId : "");
  return {
    op: op!.id,
    self: self!.id,
    anya,
    boris,
    katya: katya!,
    photos: [id(p1), id(p2)],
    file: id(file),
  };
}

describe("library", () => {
  it("counts photos and files per subject, without self-study", async () => {
    const s = await setup();
    expect(await listSubjectsWithCounts()).toEqual([
      { id: s.op, name: "Основы предпринимательства", shortName: null, photos: 2, files: 1 },
    ]);
  });

  it("groups photos by lesson and keeps files without a lesson as materials", async () => {
    const s = await setup();
    const { notes, materials } = await subjectLibrary(s.op);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Создание ООО", date: "2026-09-30", slotN: 5 });
    expect(notes[0]?.items.map((i) => i.id)).toEqual(s.photos);
    expect(materials.map((m) => m.fileName)).toEqual(["Unknown 7.pdf"]);
  });

  it("filters and searches", async () => {
    const s = await setup();
    expect((await subjectLibrary(s.op, { filter: "seminar" })).notes).toEqual([]);
    expect((await subjectLibrary(s.op, { q: "ооо" })).notes).toHaveLength(1);
    expect((await subjectLibrary(s.op, { q: "unknown" })).materials).toHaveLength(1);
    expect((await subjectLibrary(s.op, { q: "нет такого" })).materials).toEqual([]);
  });

  it("gives schedule cards a photo count per lesson", async () => {
    const s = await setup();
    const counts = await noteCounts("2026-09-28", "2026-10-04");
    expect(counts.get(`${s.op}|2026-09-30|5`)).toMatchObject({ photos: 2, files: 0 });
  });
});

describe("permissions", () => {
  it("students can delete and rename only their own uploads", async () => {
    const s = await setup();
    expect(await deleteMedia(s.boris, s.photos[0]!)).toEqual({
      ok: false,
      error: "Можно менять только свои загрузки",
    });
    expect(await renameMedia(s.anya, s.file, "Чужое")).toMatchObject({ ok: false });

    expect(await renameMedia(s.boris, s.file, "Задачи к семинару 3")).toEqual({ ok: true });
    expect(await deleteMedia(s.anya, s.photos[0]!)).toEqual({ ok: true });
    expect(await getServableMedia(s.photos[0]!)).toBeUndefined();
  });

  it("starostas can delete anything and edit lesson topics", async () => {
    const s = await setup();
    expect(await deleteMedia(s.katya, s.file)).toEqual({ ok: true });
    const noteId = (await subjectLibrary(s.op)).notes[0]!.id;
    expect(await setNoteTitle(s.katya, noteId, "Учредители ООО")).toEqual({ ok: true });
    expect(await setNoteTitle(s.boris, noteId, "Не моё")).toMatchObject({ ok: false });
    expect(await setNoteTitle(s.anya, noteId, "Учредители и договор")).toEqual({ ok: true });
  });
});
