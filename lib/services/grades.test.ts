import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import {
  groups,
  scheduleEntries,
  scheduleEntryGroups,
  semesters,
  subjects,
  timeSlots,
  users,
} from "@/lib/db/schema";
import { attendanceKey, itemKey } from "@/lib/grades/scheme";
import { objectSize, setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { gradeLessons, gradesOverview, myGrades, saveScheme, setMark } from "./grades";
import {
  deleteTeacher,
  listTeachers,
  saveTeacher,
  teacherOfSubject,
  teacherPhotoKey,
} from "./teachers";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-grades-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

async function setup() {
  await db.insert(timeSlots).values({ n: 5, startsAt: "15:55", endsAt: "17:25" });
  const [group] = await db.insert(groups).values({ code: "ИУ8-12М" }).returning();
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [op] = await db
    .insert(subjects)
    .values({ semesterId: semester!.id, name: "Основы предпринимательства" })
    .returning();
  const [entry] = await db
    .insert(scheduleEntries)
    .values({ subjectId: op!.id, weekday: 3, slotN: 5, kind: "lecture" })
    .returning();
  await db.insert(scheduleEntryGroups).values({ entryId: entry!.id, groupId: group!.id });
  const person = async (id: number, name: string, role: "student" | "starosta" = "student") => {
    const u = await upsertTelegramUser(db, { id, firstName: name }, { grantAccess: true });
    const [row] = await db
      .update(users)
      .set({ groupId: group!.id, role })
      .where(eq(users.id, u.id))
      .returning();
    return row!;
  };
  return {
    op: op!.id,
    groupId: group!.id,
    anya: await person(1, "Аня"),
    boris: await person(2, "Борис"),
    starosta: await person(3, "Катя", "starosta"),
  };
}

const scheme = {
  modules: [
    { title: "Модуль 1", until: "2026-10-11", min: 18 },
    { title: "Модуль 2", until: null, min: 18 },
  ],
  attendance: { points: 2, kinds: ["lecture" as const] },
  items: [{ key: "rk1", title: "РК 1", module: 0, max: 10 }],
  scale: [
    { from: 60, label: "Зачтено" },
    { from: 0, label: "Не зачтено" },
  ],
};

describe("teachers", () => {
  it("staff add a teacher with a photo and subjects", async () => {
    const s = await setup();
    const photo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();
    expect(
      (
        await saveTeacher(
          s.anya,
          null,
          { fullName: "Иванов И. И.", email: "", note: "", subjectIds: [] },
          null,
        )
      ).ok,
    ).toBe(false);
    const bad = await saveTeacher(
      s.starosta,
      null,
      { fullName: "Иванов И. И.", email: "not-mail", note: "", subjectIds: [] },
      null,
    );
    expect(bad).toMatchObject({ ok: false, error: "Проверьте почту" });

    const saved = await saveTeacher(
      s.starosta,
      null,
      {
        fullName: "Шкодинский С. В.",
        email: "teacher@bmstu.ru",
        note: "В теме — группа",
        subjectIds: [s.op],
      },
      photo,
    );
    const id = saved.ok ? saved.id : "";
    expect(await listTeachers()).toMatchObject([
      {
        fullName: "Шкодинский С. В.",
        email: "teacher@bmstu.ru",
        hasPhoto: true,
        subjects: [{ id: s.op, name: "Основы предпринимательства" }],
      },
    ]);
    const key = (await teacherPhotoKey(id))!;
    const meta = await sharp(await readFile(path.join(storage, key))).metadata();
    expect([meta.width, meta.height, meta.format, meta.exif]).toEqual([
      400,
      400,
      "webp",
      undefined,
    ]);
    expect(await teacherOfSubject(s.op)).toMatchObject({ email: "teacher@bmstu.ru" });

    expect((await deleteTeacher(s.starosta, id)).ok).toBe(true);
    expect(await objectSize(key)).toBeNull();
  });
});

describe("grades", () => {
  it("each marks their own attendance and points; staff see an overview", async () => {
    const s = await setup();
    expect((await saveScheme(s.anya, s.op, scheme)).ok).toBe(false);
    expect(await saveScheme(s.starosta, s.op, scheme)).toEqual({ ok: true });

    const lessons = await gradeLessons(s.groupId, s.op);
    expect(lessons[0]).toMatchObject({ date: "2026-09-02", slotN: 5, kind: "lecture" });
    for (const l of lessons.slice(0, 5)) await setMark(s.anya.id, s.op, attendanceKey(l), 1);
    await setMark(s.anya.id, s.op, itemKey("rk1"), 8);
    expect((await setMark(s.anya.id, s.op, "drop table", 1)).ok).toBe(false);

    const mine = (await myGrades(s.anya, s.op))!;
    expect(mine.result.modules[0]).toMatchObject({
      attendancePoints: 10,
      points: 18,
      status: "ok",
    });
    expect((await myGrades(s.boris, s.op))!.result.total).toBe(0); // marks are personal

    await setMark(s.anya.id, s.op, itemKey("rk1"), null);
    expect((await myGrades(s.anya, s.op))!.result.modules[0]!.points).toBe(10);

    expect(await gradesOverview(s.anya, s.op)).toEqual([]);
    const overview = await gradesOverview(s.starosta, s.op);
    expect(overview.map((r) => [r.name, r.filled, r.modules[0]!.points])).toEqual([
      ["Аня", true, 10],
      ["Борис", false, 0],
      ["Катя", false, 0],
    ]);
  });
});
