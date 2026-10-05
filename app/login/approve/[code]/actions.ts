"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { approveQrLogin } from "@/lib/services/auth";

export async function approveQrAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const code = z.string().max(64).parse(formData.get("code"));
  const result = await approveQrLogin(code, user.id);
  redirect(`/login/approve/${code}?result=${result}` as Route);
}
