import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { scheduleEntries } from "@/lib/db/schema";
import { resolveDay } from "@/lib/schedule/resolve";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { createChange, loadScheduleData } from "./schedule";
import { importSchedule, type ScheduleFile } from "./schedule-import";
import { listGroups } from "./members";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 60_000);
afterAll(() => testDb.close());
beforeEach(() => resetTestDb(db));

const file: ScheduleFile = {
  semester: {
    title: "Осень 2026",
    startsOn: "2026-08-31",
    endsOn: "2026-12-27",
    firstWeekParity: "numerator",
  },
  slots: [
    { n: 6, start: "17:35", end: "19:05" },
    { n: 7, start: "19:15", end: "20:45" },
  ],
  groups: ["ИУ8-11М", "ИУ8-12М"],
  subjects: [
    { key: "zis", name: "Защищённые информационные системы", shortName: "ЗИС", aliases: ["зис"] },
    { key: "opo", name: "Орг.-правовое обеспечение ИБ", shortName: "ОПО ИБ" },
  ],
  entries: [
    { subject: "zis", weekday: 1, slot: 6, parity: "numerator", kind: "lecture", room: "514" },
    {
      subject: "opo",
      weekday: 1,
      slot: 6,
      parity: "denominator",
      kind: "lecture",
      room: "каф. ИУ8",
    },
    { subject: "zis", weekday: 1, slot: 7, parity: "denominator", kind: "seminar", room: "413ю" },
  ],
};

describe("importSchedule", () => {
  it("loads the schedule for both groups", async () => {
    const report = await importSchedule(file, { today: "2026-10-05" });
    expect(report).toEqual({
      subjects: { created: 2, updated: 0 },
      entries: { created: 3, updated: 0, deleted: 0, ended: 0 },
    });
    const data = (await loadScheduleData())!;
    for (const group of await listGroups()) {
      expect(resolveDay(data, "2026-10-05", group.id).map((l) => l.subject.shortName)).toEqual([
        "ОПО ИБ",
        "ЗИС",
      ]);
    }
  });

  it("is idempotent and updates in place", async () => {
    await importSchedule(file, { today: "2026-10-05" });
    const changed = structuredClone(file);
    changed.entries[2]!.room = "514";
    const report = await importSchedule(changed, { today: "2026-10-05" });
    expect(report.entries).toEqual({ created: 0, updated: 3, deleted: 0, ended: 0 });
    expect(await db.select().from(scheduleEntries)).toHaveLength(3);
  });

  it("removed lessons are deleted, or ended when they have history", async () => {
    await importSchedule(file, { today: "2026-10-05" });
    const starosta = await upsertTelegramUser(
      db,
      { id: 1, firstName: "Катя" },
      { grantAccess: true },
    );
    const data = (await loadScheduleData())!;
    const groups = await listGroups();
    const seminar = data.entries.find((e) => e.slotN === 7)!;
    await createChange(
      starosta.id,
      {
        type: "cancel",
        entryId: seminar.id,
        date: "2026-10-05",
        groupIds: groups.map((g) => g.id),
      },
      { today: "2026-10-05" },
    );

    const shrunk = structuredClone(file);
    shrunk.entries = [shrunk.entries[0]!]; // drop the OPO lecture and the seminar
    const report = await importSchedule(shrunk, { today: "2026-10-06" });
    expect(report.entries).toMatchObject({ deleted: 1, ended: 1 });

    const after = (await loadScheduleData())!;
    expect(after.entries.find((e) => e.id === seminar.id)?.validTo).toBe("2026-10-05");
  });
});
