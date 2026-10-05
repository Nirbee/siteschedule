import { eq, sql } from "drizzle-orm";
import { randomToken } from "@/lib/auth/crypto";
import type { TelegramUser } from "@/lib/bot-api/contract";
import { db, type Db, type Tx } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type User = typeof users.$inferSelect;

/** «Катя С.» — how people are shown in lists. */
export function makeDisplayName(firstName: string, lastName?: string | null): string {
  const first = firstName.trim();
  const initial = lastName?.trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

/**
 * Creates or refreshes a user after Telegram confirmed who they are.
 * Access is only ever granted here, never revoked: admins revoke access explicitly.
 */
export async function upsertTelegramUser(
  tx: Db | Tx,
  tg: TelegramUser,
  { grantAccess, makeAdmin = false }: { grantAccess: boolean; makeAdmin?: boolean },
): Promise<User> {
  const profile = {
    firstName: tg.firstName,
    lastName: tg.lastName ?? null,
    username: tg.username ?? null,
    displayName: makeDisplayName(tg.firstName, tg.lastName),
  };
  const access = grantAccess || makeAdmin;
  const adminRole = makeAdmin ? ({ role: "admin" } as const) : {};
  const [user] = await tx
    .insert(users)
    .values({
      telegramId: tg.id,
      ...profile,
      hasAccess: access,
      ...adminRole,
      botStarted: true,
      icalToken: randomToken(18),
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        ...profile,
        botStarted: true,
        hasAccess: access ? true : sql`${users.hasAccess}`,
        ...adminRole,
      },
    })
    .returning();
  if (!user) throw new Error("user upsert returned nothing");
  return user;
}

export async function findUserById(tx: Db | Tx, id: string): Promise<User | undefined> {
  const [user] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function setUserTheme(userId: string, theme: User["theme"]): Promise<void> {
  await db().update(users).set({ theme }).where(eq(users.id, userId));
}
