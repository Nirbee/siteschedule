// Groups and member administration (choosing a group, admin user management).
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, groups, users } from "@/lib/db/schema";
import { revokeAllSessions } from "./auth";
import type { User } from "./users";

export type Group = typeof groups.$inferSelect;

export async function listGroups({ enabledOnly = false } = {}): Promise<Group[]> {
  return db()
    .select()
    .from(groups)
    .where(enabledOnly ? eq(groups.isEnabled, true) : undefined)
    .orderBy(asc(groups.sort), asc(groups.code));
}

export async function getGroup(id: string): Promise<Group | undefined> {
  const [group] = await db().select().from(groups).where(eq(groups.id, id));
  return group;
}

/** A member picks their group; only enabled groups are allowed. */
export async function chooseGroup(userId: string, groupId: string): Promise<boolean> {
  const group = await getGroup(groupId);
  if (!group?.isEnabled) return false;
  const updated = await db()
    .update(users)
    .set({ groupId })
    .where(and(eq(users.id, userId), eq(users.hasAccess, true)))
    .returning({ id: users.id });
  return updated.length > 0;
}

export type MemberRow = User & { groupCode: string | null };

export async function listMembers(): Promise<MemberRow[]> {
  const rows = await db()
    .select({ user: users, groupCode: groups.code })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .orderBy(asc(users.displayName));
  return rows.map(({ user, groupCode }) => ({ ...user, groupCode }));
}

type AdminChange =
  | { kind: "access"; value: boolean }
  | { kind: "blocked"; value: boolean }
  | { kind: "role"; value: User["role"] }
  | { kind: "group"; value: string | null }
  | { kind: "fullName"; value: string | null };

/** Admin edits another member. Blocking also ends all their sessions. */
export async function updateMember(actorId: string, userId: string, change: AdminChange) {
  const set =
    change.kind === "access"
      ? { hasAccess: change.value }
      : change.kind === "blocked"
        ? { isBlocked: change.value }
        : change.kind === "role"
          ? { role: change.value }
          : change.kind === "fullName"
            ? { fullName: change.value }
            : { groupId: change.value };

  await db().transaction(async (tx) => {
    await tx.update(users).set(set).where(eq(users.id, userId));
    await tx.insert(auditLog).values({
      actorId,
      action: `user.${change.kind}`,
      entity: "user",
      entityId: userId,
      payload: { value: change.value },
    });
  });
  if (change.kind === "blocked" && change.value) await revokeAllSessions(userId);
}
