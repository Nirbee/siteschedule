import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { groups, sessions } from "@/lib/db/schema";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { createSession, getSessionUser } from "./auth";
import { chooseGroup, listGroups, updateMember } from "./members";
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
  const [g11, g13] = await db
    .insert(groups)
    .values([
      { code: "ИУ8-11М", sort: 1 },
      { code: "ИУ8-13М", sort: 3, isEnabled: false },
    ])
    .returning();
  const member = await upsertTelegramUser(db, { id: 10, firstName: "Аня" }, { grantAccess: true });
  const outsider = await upsertTelegramUser(
    db,
    { id: 11, firstName: "Гость" },
    { grantAccess: false },
  );
  return { g11: g11!, g13: g13!, member, outsider };
}

describe("groups", () => {
  it("lists only enabled groups when asked", async () => {
    await setup();
    expect((await listGroups({ enabledOnly: true })).map((g) => g.code)).toEqual(["ИУ8-11М"]);
    expect(await listGroups()).toHaveLength(2);
  });

  it("members can join an enabled group only", async () => {
    const { g11, g13, member } = await setup();
    expect(await chooseGroup(member.id, g13.id)).toBe(false);
    expect(await chooseGroup(member.id, g11.id)).toBe(true);
  });

  it("people without access cannot pick a group", async () => {
    const { g11, outsider } = await setup();
    expect(await chooseGroup(outsider.id, g11.id)).toBe(false);
  });
});

describe("updateMember", () => {
  it("blocking ends all sessions and is audited", async () => {
    const { member } = await setup();
    const token = await createSession(db, member.id);
    await updateMember(member.id, member.id, { kind: "blocked", value: true });

    expect(await getSessionUser(token)).toBeNull();
    const [session] = await db.select().from(sessions);
    expect(session?.revokedAt).not.toBeNull();
  });
});
