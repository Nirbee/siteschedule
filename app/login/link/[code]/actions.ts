"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth/cookies";
import { consumeAdminLoginLink } from "@/lib/services/auth";

export async function loginWithLinkAction(formData: FormData): Promise<void> {
  const code = z.string().max(64).parse(formData.get("code"));
  const result = await consumeAdminLoginLink(code, {
    userAgent: (await headers()).get("user-agent"),
  });
  if (!result) redirect(`/login/link/${code}?error=1` as Route);
  await setSessionCookie(result.sessionToken);
  redirect("/");
}
