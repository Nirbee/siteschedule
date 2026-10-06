import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import {
  groups,
  scheduleEntries,
  scheduleEntryGroups,
  semesters,
  subjects,
  timeSlots,
} from "@/lib/db/schema";
import { resolveDay } from "@/lib/schedule/resolve";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { deleteEntry, endEntry } from "./schedule-admin";
import {
  changeableLessons,
  createChange,
  listChangeHistory,
  loadScheduleData,
  revokeChange,
} from "./schedule";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 60_000);
afterAll(() => testDb.close());
beforeEach(() => resetTestDb(db));

const TODAY = "2026-10-05"; // Monday, week 6 (denominator)
const WED = "2026-10-07";
const SAT = "2026-10-10";

async function setup() {
  const [g11, g12] = await db
    .insert(groups)
    .values([{ code: "ИУ8-11М" }, { code: "ИУ8-12М" }])
    .returning();
  await db.insert(timeSlots).values([
    { n: 3, startsAt: "11:50", endsAt: "13:20" },
    { n: 6, startsAt: "17:35", endsAt: "19:05" },
  ]);
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [audit, law] = await db
    .insert(subjects)
    .values([
      { semesterId: semester!.id, name: "Аудит ИБ" },
      { semesterId: semester!.id, name: "Правовое обеспечение ИБ" },
    ])
    .returning();
  const [wedLesson] = await db
    .insert(scheduleEntries)
    .values({ subjectId: audit!.id, weekday: 3, slotN: 6, kind: "lecture", room: "305" })
    .returning();
  await db.insert(scheduleEntryGroups).values([
    { entryId: wedLesson!.id, groupId: g11!.id },
    { entryId: wedLesson!.id, groupId: g12!.id },
  ]);
  const starosta = await upsertTelegramUser(
    db,
    { id: 5, firstName: "Катя" },
    { grantAccess: true },
  );
  return {
    g11: g11!.id,
    g12: g12!.id,
    both: [g11!.id, g12!.id],
    audit: audit!.id,
    law: law!.id,
    entry: wedLesson!.id,
    starosta: starosta.id,
  };
}

const opts = { today: TODAY };

describe("createChange", () => {
  it("moves a lesson to Saturday at a custom time and describes it", async () => {
    const s = await setup();
    const result = await createChange(
      s.starosta,
      {
        type: "move",
        entryId: s.entry,
        date: WED,
        groupIds: s.both,
        newDate: SAT,
        target: { startsAt: "10:00", endsAt: "11:30" },
        comment: "Принести ноутбуки",
      },
      opts,
    );
    expect(result).toMatchObject({
      ok: true,
      conflict: false,
      description:
        "Пара «Аудит ИБ» переносится со среды, 7 октября, 17:35 на субботу, 10 октября, 10:00.",
    });

    const data = (await loadScheduleData())!;
    for (const group of s.both) {
      expect(resolveDay(data, WED, group)[0]?.status).toBe("moved_out");
      expect(resolveDay(data, SAT, group)[0]).toMatchObject({
        status: "moved_in",
        comment: "Принести ноутбуки",
      });
    }
  });

  it("can affect just one group", async () => {
    const s = await setup();
    await createChange(
      s.starosta,
      { type: "cancel", entryId: s.entry, date: WED, groupIds: [s.g11] },
      opts,
    );
    const data = (await loadScheduleData())!;
    expect(resolveDay(data, WED, s.g11)[0]?.status).toBe("cancelled");
    expect(resolveDay(data, WED, s.g12)[0]?.status).toBe("normal");
  });

  it("rejects dates without that lesson, outside the window or in the past", async () => {
    const s = await setup();
    const cancel = (date: string) =>
      createChange(s.starosta, { type: "cancel", entryId: s.entry, date, groupIds: s.both }, opts);
    expect(await cancel("2026-10-08")).toMatchObject({ ok: false }); // Thursday: no such lesson
    expect(await cancel("2026-09-30")).toMatchObject({ ok: false }); // past
    expect(await cancel("2026-10-21")).toMatchObject({ ok: false }); // beyond 14 days
    expect(await cancel("2026-10-14")).toMatchObject({ ok: true });
  });

  it("rejects groups that do not have the lesson", async () => {
    const s = await setup();
    const [g13] = await db.insert(groups).values({ code: "ИУ8-13М" }).returning();
    const result = await createChange(
      s.starosta,
      { type: "cancel", entryId: s.entry, date: WED, groupIds: [g13!.id] },
      opts,
    );
    expect(result).toEqual({ ok: false, error: "У этих групп нет такой пары" });
  });

  it("validates input with zod (custom time must end after it starts)", async () => {
    const s = await setup();
    const result = await createChange(
      s.starosta,
      {
        type: "add",
        date: SAT,
        groupIds: s.both,
        target: { startsAt: "12:00", endsAt: "11:00" },
        newSubjectId: s.law,
        newKind: "seminar",
      },
      opts,
    );
    expect(result).toEqual({ ok: false, error: "Конец пары должен быть позже начала" });
  });

  it("reports a conflict when an extra lesson overlaps a regular one", async () => {
    const s = await setup();
    const result = await createChange(
      s.starosta,
      {
        type: "add",
        date: WED,
        groupIds: s.both,
        target: { slotN: 6 },
        newSubjectId: s.law,
        newKind: "seminar",
      },
      opts,
    );
    expect(result).toMatchObject({ ok: true, conflict: true });
  });
});

describe("revokeChange and history", () => {
  it("revoking restores the lesson and stays in the history", async () => {
    const s = await setup();
    const created = await createChange(
      s.starosta,
      { type: "room", entryId: s.entry, date: WED, groupIds: s.both, newRoom: "210" },
      opts,
    );
    if (!created.ok) throw new Error(created.error);

    expect(await revokeChange(s.starosta, created.changeId)).toBe(true);
    expect(await revokeChange(s.starosta, created.changeId)).toBe(false);
    const data = (await loadScheduleData())!;
    expect(resolveDay(data, WED, s.g12)[0]?.status).toBe("normal");

    const [item] = await listChangeHistory();
    expect(item).toMatchObject({
      authorName: "Катя",
      description: "Пара «Аудит ИБ» в среду, 7 октября, в 17:35 пройдёт в ауд. 210 вместо 305.",
    });
    expect(item?.revokedAt).not.toBeNull();
  });
});

describe("changeableLessons", () => {
  it("lists base lessons for the next two weeks", async () => {
    const s = await setup();
    const data = (await loadScheduleData())!;
    const lessons = changeableLessons(data, s.g12, TODAY);
    expect(lessons.map((l) => l.date)).toEqual([WED, "2026-10-14"]);
    expect(lessons[0]?.groupIds.sort()).toEqual([...s.both].sort());
  });
});

describe("base schedule editing", () => {
  it("lessons with changes cannot be deleted, only ended", async () => {
    const s = await setup();
    await createChange(
      s.starosta,
      { type: "cancel", entryId: s.entry, date: WED, groupIds: s.both },
      opts,
    );
    expect(await deleteEntry(s.starosta, s.entry)).toMatchObject({ ok: false });
    expect(await endEntry(s.starosta, s.entry, "2026-10-31")).toEqual({ ok: true });

    const data = (await loadScheduleData())!;
    expect(resolveDay(data, "2026-11-04", s.g12)).toEqual([]);
    expect(resolveDay(data, "2026-10-28", s.g12)).toHaveLength(1);
  });

  it("unused lessons can be deleted", async () => {
    const s = await setup();
    expect(await deleteEntry(s.starosta, s.entry)).toEqual({ ok: true });
  });
});
