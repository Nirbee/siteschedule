import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOGIN_REQUEST_TTL_MS, SESSION_RENEW_AFTER_MS, SESSION_TTL_MS } from "@/lib/auth/constants";
import type { Db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import {
  approveQrLogin,
  confirmTelegramLogin,
  consumeAdminLoginLink,
  createAdminLoginLink,
  createSession,
  getSessionUser,
  listActiveSessions,
  pollLogin,
  revokeOtherSessions,
  revokeSession,
  startLogin,
} from "./auth";
import { makeDisplayName, upsertTelegramUser } from "./users";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
}, 60_000);
afterAll(() => testDb.close());
beforeEach(() => resetTestDb(db));

const T0 = new Date("2026-10-06T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const tgUser = { id: 777001, firstName: "Катя", lastName: "Смирнова", username: "katya" };

async function telegramLogin(isChatMember: boolean | null = true) {
  const { code, pollToken } = await startLogin("telegram", { now: T0 });
  const confirm = await confirmTelegramLogin(
    { code, user: tgUser, isChatMember },
    { now: at(1000) },
  );
  return { code, pollToken, confirm };
}

describe("makeDisplayName", () => {
  it("uses the first name and the last-name initial", () => {
    expect(makeDisplayName("Катя", "смирнова")).toBe("Катя С.");
    expect(makeDisplayName(" Миша ", null)).toBe("Миша");
  });
});

describe("login via the bot", () => {
  it("pending → confirmed → one session, then the poll token is spent", async () => {
    const { code, pollToken } = await startLogin("telegram", { now: T0 });
    expect(await pollLogin(pollToken, { now: at(500) })).toEqual({ status: "pending" });

    const confirm = await confirmTelegramLogin(
      { code, user: tgUser, isChatMember: true },
      { now: at(1000) },
    );
    expect(confirm).toEqual({ result: "confirmed", hasAccess: true });

    const poll = await pollLogin(pollToken, { now: at(2000), userAgent: "test-agent" });
    expect(poll.status).toBe("ok");
    if (poll.status !== "ok") return;
    expect(poll.user).toMatchObject({
      telegramId: 777001,
      displayName: "Катя С.",
      hasAccess: true,
    });
    expect(poll.user.botStarted).toBe(true);

    const resolved = await getSessionUser(poll.sessionToken, { now: at(3000) });
    expect(resolved?.user.id).toBe(poll.user.id);
    expect(resolved?.session.userAgent).toBe("test-agent");

    expect(await pollLogin(pollToken, { now: at(4000) })).toEqual({ status: "expired" });
  });

  it("rejects an expired code and an expired poll", async () => {
    const { code, pollToken } = await startLogin("telegram", { now: T0 });
    const late = at(LOGIN_REQUEST_TTL_MS + 1);
    expect(
      await confirmTelegramLogin({ code, user: tgUser, isChatMember: true }, { now: late }),
    ).toEqual({ result: "expired", hasAccess: false });
    expect(await pollLogin(pollToken, { now: late })).toEqual({ status: "expired" });
  });

  it("does not accept the same code twice", async () => {
    const { code } = await telegramLogin();
    const again = await confirmTelegramLogin(
      { code, user: { ...tgUser, id: 999 }, isChatMember: true },
      { now: at(5000) },
    );
    expect(again.result).toBe("expired");
  });

  it("returns not_found for unknown or malformed codes", async () => {
    for (const code of ["nope", "A".repeat(43)]) {
      expect(
        await confirmTelegramLogin({ code, user: tgUser, isChatMember: true }, { now: T0 }),
      ).toEqual({ result: "not_found", hasAccess: false });
    }
  });

  it("a QR code cannot be confirmed through the bot", async () => {
    const { code } = await startLogin("qr", { now: T0 });
    const result = await confirmTelegramLogin(
      { code, user: tgUser, isChatMember: true },
      { now: at(1000) },
    );
    expect(result.result).toBe("not_found");
  });
});

describe("access", () => {
  it("non-members log in but get no access", async () => {
    const { confirm } = await telegramLogin(false);
    expect(confirm).toEqual({ result: "confirmed", hasAccess: false });
  });

  it("access granted once is not taken away by a later login", async () => {
    await telegramLogin(true);
    const { confirm } = await telegramLogin(false);
    expect(confirm.hasAccess).toBe(true);
  });

  it("unverified membership grants access only when explicitly allowed", async () => {
    const strict = await telegramLogin(null);
    expect(strict.confirm.hasAccess).toBe(false);

    const { code } = await startLogin("telegram", { now: T0 });
    const relaxed = await confirmTelegramLogin(
      { code, user: tgUser, isChatMember: null },
      { now: at(1000), allowUnverified: true },
    );
    expect(relaxed.hasAccess).toBe(true);
  });

  it("bootstrap admins get the admin role and access even without the chat", async () => {
    const { code, pollToken } = await startLogin("telegram", { now: T0 });
    const confirm = await confirmTelegramLogin(
      { code, user: tgUser, isChatMember: false },
      { now: at(1000), adminTelegramIds: [tgUser.id] },
    );
    expect(confirm.hasAccess).toBe(true);
    const poll = await pollLogin(pollToken, { now: at(2000) });
    expect(poll.status === "ok" && poll.user.role).toBe("admin");
  });

  it("blocked users cannot finish a login", async () => {
    const { pollToken } = await telegramLogin(true);
    await db.update(users).set({ isBlocked: true }).where(eq(users.telegramId, tgUser.id));
    expect(await pollLogin(pollToken, { now: at(2000) })).toEqual({ status: "expired" });
  });

  it("updates the profile on every login", async () => {
    await telegramLogin(true);
    const user = await upsertTelegramUser(
      db,
      { id: tgUser.id, firstName: "Екатерина", username: "kate" },
      { grantAccess: false },
    );
    expect(user).toMatchObject({ displayName: "Екатерина", username: "kate", hasAccess: true });
  });
});

describe("QR login on another device", () => {
  it("the approver's account is logged in on the new device", async () => {
    const approver = await upsertTelegramUser(db, tgUser, { grantAccess: true });
    const { code, pollToken } = await startLogin("qr", { now: T0 });
    expect(await approveQrLogin(code, approver.id, { now: at(1000) })).toBe("confirmed");

    const poll = await pollLogin(pollToken, { now: at(2000) });
    expect(poll.status === "ok" && poll.user.id).toBe(approver.id);
  });

  it("an expired QR cannot be approved", async () => {
    const approver = await upsertTelegramUser(db, tgUser, { grantAccess: true });
    const { code, pollToken } = await startLogin("qr", { now: T0 });
    const late = at(LOGIN_REQUEST_TTL_MS + 1);
    expect(await approveQrLogin(code, approver.id, { now: late })).toBe("expired");
    expect(await pollLogin(pollToken, { now: late })).toEqual({ status: "expired" });
  });

  it("a QR can be approved only once", async () => {
    const approver = await upsertTelegramUser(db, tgUser, { grantAccess: true });
    const { code } = await startLogin("qr", { now: T0 });
    await approveQrLogin(code, approver.id, { now: at(1000) });
    expect(await approveQrLogin(code, approver.id, { now: at(2000) })).toBe("expired");
  });
});

describe("admin login link", () => {
  it("works once and only before it expires", async () => {
    const admin = await upsertTelegramUser(
      db,
      { id: 1, firstName: "Админ" },
      { grantAccess: true },
    );
    const user = await upsertTelegramUser(db, tgUser, { grantAccess: true });

    const { code, expiresAt } = await createAdminLoginLink(admin.id, user.id, { now: T0 });
    const first = await consumeAdminLoginLink(code, { now: at(1000) });
    expect(first?.user.id).toBe(user.id);
    expect(await consumeAdminLoginLink(code, { now: at(2000) })).toBeNull();

    const second = await createAdminLoginLink(admin.id, user.id, { now: T0 });
    const afterExpiry = new Date(expiresAt.getTime() + 1);
    expect(await consumeAdminLoginLink(second.code, { now: afterExpiry })).toBeNull();
  });
});

describe("sessions", () => {
  async function session() {
    const user = await upsertTelegramUser(db, tgUser, { grantAccess: true });
    const token = await createSession(db, user.id, { now: T0 });
    return { user, token };
  }

  it("expire after the TTL without visits", async () => {
    const { user, token } = await session();
    expect(await getSessionUser(token, { now: at(SESSION_TTL_MS + 1) })).toBeNull();

    const other = await createSession(db, user.id, { now: T0 });
    expect(await getSessionUser(other, { now: at(SESSION_TTL_MS - 1) })).not.toBeNull();
  });

  it("slide forward when the user keeps coming back", async () => {
    const { token } = await session();
    const visit = at(SESSION_RENEW_AFTER_MS + 1000);
    const renewed = await getSessionUser(token, { now: visit });
    expect(renewed?.session.expiresAt.getTime()).toBe(visit.getTime() + SESSION_TTL_MS);
    // Still valid long after the original expiry.
    expect(await getSessionUser(token, { now: at(SESSION_TTL_MS + 1) })).not.toBeNull();
  });

  it("do not touch the database more than once a day", async () => {
    const { token } = await session();
    await getSessionUser(token, { now: at(60_000) });
    const [row] = await db.select().from(sessions);
    expect(row?.lastUsedAt.getTime()).toBe(T0.getTime());
  });

  it("stop working when revoked or when the user is blocked", async () => {
    const { user, token } = await session();
    const resolved = await getSessionUser(token, { now: T0 });
    await revokeSession(resolved!.session.id);
    expect(await getSessionUser(token, { now: T0 })).toBeNull();

    const token2 = await createSession(db, user.id, { now: T0 });
    await db.update(users).set({ isBlocked: true }).where(eq(users.id, user.id));
    expect(await getSessionUser(token2, { now: T0 })).toBeNull();
  });

  it("«log out other devices» keeps the current one", async () => {
    const { user, token } = await session();
    const other = await createSession(db, user.id, { now: T0 });
    const current = await getSessionUser(token, { now: T0 });
    await revokeOtherSessions(user.id, current!.session.id);

    expect(await getSessionUser(token, { now: T0 })).not.toBeNull();
    expect(await getSessionUser(other, { now: T0 })).toBeNull();
    expect(await listActiveSessions(user.id, { now: T0 })).toHaveLength(1);
  });

  it("ignore malformed tokens", async () => {
    expect(await getSessionUser("garbage")).toBeNull();
  });
});
