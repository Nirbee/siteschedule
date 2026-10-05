import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/services/auth";
import type { User } from "@/lib/services/users";
import { SESSION_COOKIE } from "./constants";

export type Role = User["role"];
export type CurrentUser = { user: User; sessionId: string };

/** The logged-in user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const resolved = await getSessionUser(token);
  return resolved ? { user: resolved.user, sessionId: resolved.session.id } : null;
});

export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}

/** Logged in, has access, and belongs to an enabled group. */
export async function requireMember(): Promise<CurrentUser> {
  const current = await requireUser();
  if (!current.user.hasAccess) redirect("/no-access");
  if (!current.user.groupId || !(await isGroupEnabled(current.user.groupId))) {
    redirect("/join-group");
  }
  return current;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const current = await requireMember();
  if (!roles.includes(current.user.role)) notFound();
  return current;
}

export const isStaff = (role: Role) => role === "starosta" || role === "admin";

const isGroupEnabled = cache(async (groupId: string) => {
  const [group] = await db()
    .select({ isEnabled: groups.isEnabled })
    .from(groups)
    .where(eq(groups.id, groupId));
  return group?.isEnabled === true;
});
