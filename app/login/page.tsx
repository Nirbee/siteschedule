import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { AuthCard } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  const devUsers =
    process.env.NODE_ENV === "development"
      ? await db()
          .select({ id: users.id, displayName: users.displayName, role: users.role })
          .from(users)
          .orderBy(asc(users.telegramId))
          .limit(20)
      : [];

  return (
    <AuthCard title="Вход">
      <LoginPanel devUsers={devUsers} />
    </AuthCard>
  );
}
