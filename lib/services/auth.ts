// Login requests (Telegram bot, QR from another device, admin link) and sessions.
// See docs/DATA_MODEL.md «Вход и сессии».
import { and, desc, eq, gt, isNull, lt, ne } from "drizzle-orm";
import {
  ADMIN_LINK_TTL_MS,
  LOGIN_REQUEST_TTL_MS,
  SESSION_RENEW_AFTER_MS,
  SESSION_TTL_MS,
} from "@/lib/auth/constants";
import { TOKEN_PATTERN, randomToken, sha256Hex } from "@/lib/auth/crypto";
import type { LoginConfirmRequest } from "@/lib/bot-api/contract";
import { db, type Db, type Tx } from "@/lib/db/client";
import { loginRequests, sessions, users } from "@/lib/db/schema";
import { upsertTelegramUser, type User } from "./users";

type Clock = { now?: Date };
export type Session = typeof sessions.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);

// Login requests ---------------------------------------------------------------

/** Starts a login that a browser will wait for: via the bot, or via QR from a logged-in phone. */
export async function startLogin(
  method: "telegram" | "qr",
  { now = new Date() }: Clock = {},
): Promise<{ code: string; pollToken: string; expiresAt: Date }> {
  const code = randomToken();
  const pollToken = randomToken();
  const expiresAt = plus(now, LOGIN_REQUEST_TTL_MS);

  // Housekeeping: requests expired for more than a day are useless.
  await db()
    .delete(loginRequests)
    .where(lt(loginRequests.expiresAt, plus(now, -DAY_MS)));
  await db()
    .insert(loginRequests)
    .values({
      method,
      codeHash: sha256Hex(code),
      pollHash: sha256Hex(pollToken),
      createdAt: now,
      expiresAt,
    });
  return { code, pollToken, expiresAt };
}

export type ConfirmResult = { result: "confirmed" | "expired" | "not_found"; hasAccess: boolean };

/** Called by the bot after the user pressed Start with the login code. */
export async function confirmTelegramLogin(
  input: LoginConfirmRequest,
  {
    allowUnverified = false,
    adminTelegramIds = [],
    now = new Date(),
  }: Clock & { allowUnverified?: boolean; adminTelegramIds?: number[] } = {},
): Promise<ConfirmResult> {
  if (!TOKEN_PATTERN.test(input.code)) return { result: "not_found", hasAccess: false };

  return db().transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(loginRequests)
      .where(
        and(
          eq(loginRequests.codeHash, sha256Hex(input.code)),
          eq(loginRequests.method, "telegram"),
        ),
      )
      .for("update");
    if (!request) return { result: "not_found", hasAccess: false };
    if (request.status !== "pending" || request.expiresAt <= now) {
      return { result: "expired", hasAccess: false };
    }

    const grantAccess =
      input.isChatMember === true || (input.isChatMember === null && allowUnverified);
    const user = await upsertTelegramUser(tx, input.user, {
      grantAccess,
      makeAdmin: adminTelegramIds.includes(input.user.id),
    });
    await tx
      .update(loginRequests)
      .set({ status: "confirmed", userId: user.id, confirmedAt: now })
      .where(eq(loginRequests.id, request.id));

    return { result: "confirmed", hasAccess: user.hasAccess && !user.isBlocked };
  });
}

/** A logged-in user confirms a QR shown on another device. */
export async function approveQrLogin(
  code: string,
  approverId: string,
  { now = new Date() }: Clock = {},
): Promise<"confirmed" | "expired" | "not_found"> {
  if (!TOKEN_PATTERN.test(code)) return "not_found";

  const [request] = await db()
    .select()
    .from(loginRequests)
    .where(and(eq(loginRequests.codeHash, sha256Hex(code)), eq(loginRequests.method, "qr")));
  if (!request) return "not_found";

  const updated = await db()
    .update(loginRequests)
    .set({ status: "confirmed", userId: approverId, approvedBy: approverId, confirmedAt: now })
    .where(
      and(
        eq(loginRequests.id, request.id),
        eq(loginRequests.status, "pending"),
        gt(loginRequests.expiresAt, now),
      ),
    )
    .returning({ id: loginRequests.id });
  return updated.length > 0 ? "confirmed" : "expired";
}

export type PollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "ok"; sessionToken: string; user: User };

/** The waiting browser asks whether its login was confirmed; on success a session is issued once. */
export async function pollLogin(
  pollToken: string,
  { userAgent, now = new Date() }: Clock & { userAgent?: string | null } = {},
): Promise<PollResult> {
  if (!TOKEN_PATTERN.test(pollToken)) return { status: "expired" };

  const [request] = await db()
    .select()
    .from(loginRequests)
    .where(eq(loginRequests.pollHash, sha256Hex(pollToken)));
  if (!request) return { status: "expired" };
  if (request.status === "pending") {
    return request.expiresAt > now ? { status: "pending" } : { status: "expired" };
  }
  if (request.status !== "confirmed" || !request.userId) return { status: "expired" };

  return db().transaction(async (tx) => {
    // Only one poll can consume the confirmation.
    const [consumed] = await tx
      .update(loginRequests)
      .set({ status: "consumed", consumedAt: now })
      .where(and(eq(loginRequests.id, request.id), eq(loginRequests.status, "confirmed")))
      .returning({ userId: loginRequests.userId });
    if (!consumed?.userId) return { status: "expired" } as const;

    const [user] = await tx.select().from(users).where(eq(users.id, consumed.userId));
    if (!user || user.isBlocked) return { status: "expired" } as const;

    const sessionToken = await createSession(tx, user.id, { userAgent, now });
    return { status: "ok", sessionToken, user } as const;
  });
}

/** Admin creates a one-time login link for a user who cannot log in via the bot. */
export async function createAdminLoginLink(
  adminId: string,
  userId: string,
  { now = new Date() }: Clock = {},
): Promise<{ code: string; expiresAt: Date }> {
  const code = randomToken();
  const expiresAt = plus(now, ADMIN_LINK_TTL_MS);
  await db()
    .insert(loginRequests)
    .values({
      method: "admin_link",
      codeHash: sha256Hex(code),
      status: "confirmed",
      userId,
      approvedBy: adminId,
      createdAt: now,
      confirmedAt: now,
      expiresAt,
    });
  return { code, expiresAt };
}

export async function consumeAdminLoginLink(
  code: string,
  { userAgent, now = new Date() }: Clock & { userAgent?: string | null } = {},
): Promise<{ sessionToken: string; user: User } | null> {
  if (!TOKEN_PATTERN.test(code)) return null;

  return db().transaction(async (tx) => {
    const [request] = await tx
      .update(loginRequests)
      .set({ status: "consumed", consumedAt: now })
      .where(
        and(
          eq(loginRequests.codeHash, sha256Hex(code)),
          eq(loginRequests.method, "admin_link"),
          eq(loginRequests.status, "confirmed"),
        ),
      )
      .returning();
    if (!request?.userId || request.expiresAt <= now) return null;

    const [user] = await tx.select().from(users).where(eq(users.id, request.userId));
    if (!user || user.isBlocked) return null;
    return { sessionToken: await createSession(tx, user.id, { userAgent, now }), user };
  });
}

// Sessions -----------------------------------------------------------------------

export async function createSession(
  tx: Db | Tx,
  userId: string,
  { userAgent, now = new Date() }: Clock & { userAgent?: string | null } = {},
): Promise<string> {
  const token = randomToken();
  await tx.insert(sessions).values({
    id: sha256Hex(token),
    userId,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: plus(now, SESSION_TTL_MS),
    userAgent: userAgent?.slice(0, 400) ?? null,
  });
  // Shown to admins as «заходил(а) …»; later updated when the session is renewed.
  await tx.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId));
  return token;
}

/** Resolves a session cookie to its user. Slides the expiry forward at most once a day. */
export async function getSessionUser(
  token: string,
  { now = new Date() }: Clock = {},
): Promise<{ session: Session; user: User } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const [row] = await db()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sha256Hex(token)));
  if (!row) return null;
  const { session, user } = row;
  if (session.revokedAt || session.expiresAt <= now || user.isBlocked) return null;

  if (now.getTime() - session.lastUsedAt.getTime() > SESSION_RENEW_AFTER_MS) {
    const expiresAt = plus(now, SESSION_TTL_MS);
    await db()
      .update(sessions)
      .set({ lastUsedAt: now, expiresAt })
      .where(eq(sessions.id, session.id));
    await db().update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));
    return { session: { ...session, lastUsedAt: now, expiresAt }, user };
  }
  return { session, user };
}

export async function listActiveSessions(userId: string, { now = new Date() }: Clock = {}) {
  const rows = await db()
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastUsedAt));
  return rows.filter((s) => s.expiresAt > now);
}

export async function revokeSession(sessionId: string, { now = new Date() }: Clock = {}) {
  await db()
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** «Выйти на остальных устройствах». */
export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string,
  { now = new Date() }: Clock = {},
) {
  await db()
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.revokedAt)),
    );
}

export async function revokeAllSessions(userId: string, { now = new Date() }: Clock = {}) {
  await db()
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
