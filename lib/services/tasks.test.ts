import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { media, semesters, subjects, timeSlots, users } from "@/lib/db/schema";
import { ingest } from "@/lib/ingest/ingest";
import { setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import {
  deleteAssignment,
  deleteControlEvent,
  getControlEvent,
  listAssignments,
  listControlEvents,
  materialOptions,
  saveAssignment,
  saveControlEvent,
  setAssignmentDone,
} from "./tasks";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-tasks-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

async function setup() {
  await db.insert(timeSlots).values({ n: 2, startsAt: "10:10", endsAt: "11:40" });
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [logic] = await db
    .insert(subjects)
    .values({ semesterId: semester!.id, name: "Логика" })
    .returning();
  const student = await upsertTelegramUser(db, { id: 1, firstName: "Аня" }, { grantAccess: true });
  const other = await upsertTelegramUser(db, { id: 2, firstName: "Борис" }, { grantAccess: true });
  const [starosta] = await db
    .update(users)
    .set({ role: "starosta" })
    .where(
      eq(
        users.id,
        (await upsertTelegramUser(db, { id: 3, firstName: "Катя" }, { grantAccess: true })).id,
      ),
    )
    .returning();
  const book = await ingest({
    bytes: Buffer.from("Классы вычетов и отношение эквивалентности"),
    fileName: "Учебник.txt",
    target: { type: "materials", subjectId: logic!.id },
    uploaderId: starosta!.id,
  });
  return {
    logic: logic!.id,
    student,
    other,
    starosta: starosta!,
    bookId: book.status === "created" ? book.mediaId : "",
  };
}

const due = { date: "2026-10-07", slotN: 2, startsAt: null };

describe("homework", () => {
  it("starosta adds homework with materials; students only read it", async () => {
    const s = await setup();
    const denied = await saveAssignment(s.student, null, {
      subjectId: s.logic,
      due,
      body: "Прочитать главу 0",
    });
    expect(denied.ok).toBe(false);

    const saved = await saveAssignment(s.starosta, null, {
      subjectId: s.logic,
      due,
      body: "Прочитать главу 0\nОтношение эквивалентности",
      materials: [
        { mediaId: s.bookId, page: 52 },
        { url: "https://example.org/lecture", title: "Запись лекции" },
      ],
    });
    expect(saved.ok).toBe(true);

    const [item] = await listAssignments(s.student.id);
    expect(item).toMatchObject({
      subjectName: "Логика",
      due,
      done: false,
      materials: [
        { kind: "media", mediaId: s.bookId, page: 52, fileName: "Учебник.txt" },
        { kind: "link", url: "https://example.org/lecture", title: "Запись лекции" },
      ],
    });
  });

  it("«сделано» is personal", async () => {
    const s = await setup();
    const saved = await saveAssignment(s.starosta, null, { subjectId: s.logic, due, body: "x" });
    const id = saved.ok ? saved.id : "";
    await setAssignmentDone(s.student.id, id, true);
    await setAssignmentDone(s.student.id, id, true); // twice is fine
    expect((await listAssignments(s.student.id))[0]!.done).toBe(true);
    expect((await listAssignments(s.other.id))[0]!.done).toBe(false);
    await setAssignmentDone(s.student.id, id, false);
    expect((await listAssignments(s.student.id))[0]!.done).toBe(false);
  });

  it("filters by due date and hides deleted files from materials", async () => {
    const s = await setup();
    await saveAssignment(s.starosta, null, {
      subjectId: s.logic,
      due,
      body: "a",
      materials: [{ mediaId: s.bookId }],
    });
    await saveAssignment(s.starosta, null, {
      subjectId: s.logic,
      due: { date: "2026-10-21", slotN: null, startsAt: null },
      body: "b",
    });
    expect(
      (await listAssignments(s.student.id, { from: "2026-10-08" })).map((a) => a.body),
    ).toEqual(["b"]);

    await db.update(media).set({ deletedAt: new Date() }).where(eq(media.id, s.bookId));
    const [first] = await listAssignments(s.student.id, { to: "2026-10-07" });
    expect(first!.materials).toEqual([]);
  });

  it("validates input and edits, deletes", async () => {
    const s = await setup();
    const bad = await saveAssignment(s.starosta, null, {
      subjectId: s.logic,
      due,
      body: "x",
      materials: [{ url: "javascript:alert(1)" }],
    });
    expect(bad.ok).toBe(false);
    const empty = await saveAssignment(s.starosta, null, { subjectId: s.logic, due, body: "  " });
    expect(empty).toEqual({ ok: false, error: "Напишите, что задано" });

    const saved = await saveAssignment(s.starosta, null, { subjectId: s.logic, due, body: "x" });
    const id = saved.ok ? saved.id : "";
    await saveAssignment(s.starosta, id, { subjectId: s.logic, due, body: "y" });
    expect((await listAssignments(s.student.id)).map((a) => a.body)).toEqual(["y"]);
    expect((await deleteAssignment(s.student, id)).ok).toBe(false);
    expect((await deleteAssignment(s.starosta, id)).ok).toBe(true);
    expect(await listAssignments(s.student.id)).toEqual([]);
  });
});

describe("control events", () => {
  it("stores what will be, the rules and preparation materials", async () => {
    const s = await setup();
    const saved = await saveControlEvent(s.starosta, null, {
      subjectId: s.logic,
      date: "2026-10-14",
      target: { startsAt: "12:00", endsAt: "13:30" },
      form: "Контрольная работа",
      topics: "Алгоритмы на графах\nБулевы функции",
      rules: "Можно пользоваться записями",
      materials: [{ mediaId: s.bookId, page: 10 }],
    });
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.id : "";

    expect(await getControlEvent(id)).toMatchObject({
      subjectName: "Логика",
      date: "2026-10-14",
      slotN: null,
      startsAt: "12:00",
      endsAt: "13:30",
      topics: "Алгоритмы на графах\nБулевы функции",
      materials: [{ kind: "media", page: 10 }],
    });

    await saveControlEvent(s.starosta, id, {
      subjectId: s.logic,
      date: "2026-10-14",
      target: { slotN: 2 },
      form: "Тест",
    });
    const [event] = await listControlEvents({ from: "2026-10-01" });
    expect(event).toMatchObject({ slotN: 2, startsAt: null, form: "Тест", materials: [] });

    expect((await deleteControlEvent(s.student, id)).ok).toBe(false);
    expect((await deleteControlEvent(s.starosta, id)).ok).toBe(true);
    expect(await listControlEvents()).toEqual([]);
  });
});

describe("materialOptions", () => {
  it("lists library files by subject", async () => {
    const s = await setup();
    const options = await materialOptions();
    expect(options[s.logic]).toMatchObject([{ value: `m:${s.bookId}`, kind: "file" }]);
  });
});
