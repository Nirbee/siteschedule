"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie } from "./cookies";
import { getCurrentUser, requireUser } from "./current";
import { revokeOtherSessions, revokeSession } from "@/lib/services/auth";

export async function logoutAction(): Promise<void> {
  const current = await getCurrentUser();
  if (current) await revokeSession(current.sessionId);
  await clearSessionCookie();
  redirect("/login");
}

export async function logoutOtherDevicesAction(): Promise<void> {
  const { user, sessionId } = await requireUser();
  await revokeOtherSessions(user.id, sessionId);
  redirect("/profile");
}
