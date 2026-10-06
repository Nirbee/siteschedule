import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { groups, semesters, subjects, topicLists, users } from "@/lib/db/schema";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { classCode } from "@/lib/topics/rules";
import {
  addTopics,
  assignMember,
  classCodeState,
  createTopicList,
  enterClassCode,
  exportRows,
  getTopicList,
  leaveTopic,
  listTopicLists,
  openForClass,
  presentations,
  setOpensAt,
  setOwnFullName,
  takeTopic,
  updateTopic,
} from "./topics";
import { upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 60_000);
afterAll(() => testDb.close());
beforeEach(() => resetTestDb(db));

async function setup() {
  const [g12] = await db.insert(groups).values({ code: "ИУ8-12М" }).returning();
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({ semesterId: semester!.id, name: "ОПО ИБ" })
    .returning();
  const person = async (id: number, name: string, fullName: string | null) => {
    const u = await upsertTelegramUser(db, { id, firstName: name }, { grantAccess: true });
    const [row] = await db
      .update(users)
      .set({ fullName, groupId: g12!.id })
      .where(eq(users.id, u.id))
      .returning();
    return row!;
  };
  const anya = await person(1, "Аня", "Иванова Анна");
  const boris = await person(2, "Борис", "Петров Борис");
  const noName = await person(3, "Вова", null);
  const [starosta] = await db
    .update(users)
    .set({ role: "starosta" })
    .where(eq(users.id, (await person(4, "Катя", "Сидорова Катя")).id))
    .returning();

  const created = await createTopicList(
    starosta!,
    { subjectId: subject!.id, title: "Доклады", defaultCapacity: 1 },
    [
      { title: "Государственная тайна", details: null },
      { title: "Персональные данные", details: "Биометрия" },
    ],
  );
  if (!created.ok) throw new Error(created.error);
  const list = (await getTopicList(created.id, starosta!))!;
  return {
    anya,
    boris,
    noName,
    starosta: starosta!,
    listId: created.id,
    t1: list.topics[0]!.id,
    t2: list.topics[1]!.id,
  };
}

describe("topic lists", () => {
  it("drafts are hidden from students", async () => {
    const s = await setup();
    expect(await listTopicLists(s.anya)).toEqual([]);
    expect(await getTopicList(s.listId, s.anya)).toBeUndefined();
    expect((await listTopicLists(s.starosta)).map((l) => l.phase)).toEqual(["draft"]);
  });

  it("only staff create lists", async () => {
    const s = await setup();
    const denied = await createTopicList(
      s.anya,
      { subjectId: "00000000-0000-0000-0000-000000000000", title: "x", defaultCapacity: 1 },
      [{ title: "t", details: null }],
    );
    expect(denied.ok).toBe(false);
  });
});

describe("class phase", () => {
  it("those with the code pick first, the rest wait for «open for all»", async () => {
    const s = await setup();
    await openForClass(s.starosta, s.listId);

    const waiting = await takeTopic(s.boris, s.t1);
    expect(waiting).toMatchObject({ ok: false });

    const state = await classCodeState(s.starosta, s.listId);
    if (!state.ok) throw new Error(state.error);
    // Every digit differs from the real code (and from the previous one only by chance).
    const wrong = [...state.code].map((d) => (Number(d) + 5) % 10).join("");
    expect(await enterClassCode(s.anya, s.listId, wrong)).toMatchObject({ ok: false });
    expect(await enterClassCode(s.anya, s.listId, state.code)).toEqual({ ok: true });
    expect(await takeTopic(s.anya, s.t1)).toEqual({ ok: true });

    expect((await getTopicList(s.listId, s.boris))?.canPick).toBe(false);
    await setOpensAt(s.starosta, s.listId, new Date(Date.now() - 1000));
    expect((await getTopicList(s.listId, s.boris))?.canPick).toBe(true);
    expect(await takeTopic(s.boris, s.t2)).toEqual({ ok: true });
  });

  it("the code works for the current 30 s only", async () => {
    const s = await setup();
    await openForClass(s.starosta, s.listId);
    const [list] = await db.select().from(topicLists).where(eq(topicLists.id, s.listId));
    const old = classCode(list!.classSecret!, Date.now() - 5 * 60_000);
    const current = classCode(list!.classSecret!, Date.now());
    if (old !== current) {
      expect(await enterClassCode(s.boris, s.listId, old)).toMatchObject({ ok: false });
    }
  });
});

describe("picking", () => {
  async function opened() {
    const s = await setup();
    await setOpensAt(s.starosta, s.listId, new Date(Date.now() - 1000));
    return s;
  }

  it("asks for the full name first", async () => {
    const s = await opened();
    expect(await takeTopic(s.noName, s.t1)).toMatchObject({ ok: false, needName: true });
    expect(await setOwnFullName(s.noName.id, "x")).toMatchObject({ ok: false });
    expect(await setOwnFullName(s.noName.id, "Васильев Владимир")).toEqual({ ok: true });
  });

  it("no overbooking, one topic per person, leave and take another", async () => {
    const s = await opened();
    const both = await Promise.all([takeTopic(s.anya, s.t1), takeTopic(s.boris, s.t1)]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    const loser = both[0]!.ok ? s.boris : s.anya;
    const winner = both[0]!.ok ? s.anya : s.boris;

    expect(await takeTopic(winner, s.t2)).toMatchObject({
      ok: false,
      error: expect.stringContaining("уже есть тема"),
    });
    expect(await takeTopic(loser, s.t2)).toEqual({ ok: true });

    expect(await leaveTopic(winner, s.t1)).toEqual({ ok: true });
    const view = (await getTopicList(s.listId, winner))!;
    expect(view.topics.map((t) => t.status)).toEqual(["free", "full"]);
    expect(view.topics[1]!.members).toEqual([
      { userId: loser.id, name: loser.fullName, group: "12М" },
    ]);
  });

  it("teams: capacity 2", async () => {
    const s = await opened();
    await updateTopic(s.starosta, s.t1, { title: "Государственная тайна", capacity: 2 });
    expect(await takeTopic(s.anya, s.t1)).toEqual({ ok: true });
    expect((await getTopicList(s.listId, s.boris))!.topics[0]!.status).toBe("partial");
    expect(await takeTopic(s.boris, s.t1)).toEqual({ ok: true });
    expect(
      await updateTopic(s.starosta, s.t1, { title: "Государственная тайна", capacity: 1 }),
    ).toMatchObject({ ok: false });
  });

  it("after the deadline only the starosta changes things", async () => {
    const s = await opened();
    await takeTopic(s.anya, s.t1);
    const list = await getTopicList(s.listId, s.starosta);
    const { updateTopicList } = await import("./topics");
    await updateTopicList(s.starosta, s.listId, {
      subjectId: list!.subjectId,
      title: "Доклады",
      defaultCapacity: 1,
      pickDeadline: "2026-01-01T10:00",
    });
    expect(await leaveTopic(s.anya, s.t1)).toMatchObject({ ok: false });
    expect(await takeTopic(s.boris, s.t2)).toMatchObject({ ok: false });
    expect(await assignMember(s.starosta, s.t2, s.boris.id)).toEqual({ ok: true });
    // Assigning moves a person between topics of the list.
    expect(await assignMember(s.starosta, s.t2, s.anya.id)).toMatchObject({ ok: false });
    await updateTopic(s.starosta, s.t2, { title: "Персональные данные", capacity: 2 });
    expect(await assignMember(s.starosta, s.t2, s.anya.id)).toEqual({ ok: true });
    const view = (await getTopicList(s.listId, s.starosta))!;
    expect(view.topics[0]!.members).toEqual([]);
    expect(view.topics[1]!.members.map((m) => m.name)).toEqual(["Петров Борис", "Иванова Анна"]);
  });
});

describe("export and schedule", () => {
  it("rows like the starostas' table, presentations by date", async () => {
    const s = await setup();
    await setOpensAt(s.starosta, s.listId, new Date(Date.now() - 1000));
    await takeTopic(s.anya, s.t2);
    await addTopics(s.starosta, s.listId, [{ title: "КИИ", details: null }]);
    await updateTopic(s.starosta, s.t2, {
      title: "Персональные данные",
      details: "Биометрия",
      capacity: 1,
      dueDate: "2026-10-12",
      dueOrder: 1,
    });

    expect(await exportRows(s.listId, s.starosta.id)).toEqual([
      { n: 1, title: "Государственная тайна", details: null, name: "", group: "", dueDate: null },
      {
        n: 2,
        title: "Персональные данные",
        details: "Биометрия",
        name: "Иванова Анна",
        group: "12",
        dueDate: "2026-10-12",
      },
      { n: 3, title: "КИИ", details: null, name: "", group: "", dueDate: null },
    ]);

    expect(await presentations(s.anya.id, "2026-10-12", "2026-10-12")).toMatchObject([
      { date: "2026-10-12", n: 2, names: ["Иванова Анна"], mine: true },
    ]);
  });
});
