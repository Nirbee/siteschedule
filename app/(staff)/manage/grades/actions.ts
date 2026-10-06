"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { deleteScheme, saveScheme, type Result } from "@/lib/services/grades";
import type { GradingConfigInput } from "@/lib/grades/scheme";

export async function saveSchemeAction(subjectId: string, config: unknown): Promise<Result> {
  const { user } = await requireRole("starosta", "admin");
  // saveScheme validates the config with zod.
  const result = await saveScheme(user, z.uuid().parse(subjectId), config as GradingConfigInput);
  if (result.ok) revalidatePath("/grades", "layout");
  return result;
}

export async function deleteSchemeAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("starosta", "admin");
  await deleteScheme(user, z.uuid().parse(formData.get("subjectId")));
  revalidatePath("/grades", "layout");
  redirect("/manage/grades");
}
