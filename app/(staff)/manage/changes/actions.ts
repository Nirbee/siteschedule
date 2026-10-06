"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { createChange, revokeChange } from "@/lib/services/schedule";

export type ChangeFormState = { error?: string };

export async function createChangeAction(
  _prev: ChangeFormState,
  formData: FormData,
): Promise<ChangeFormState> {
  const { user } = await requireRole("starosta", "admin");
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Не удалось прочитать форму" };
  }
  // createChange validates the payload with zod.
  const result = await createChange(user.id, payload as Parameters<typeof createChange>[1]);
  if (!result.ok) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(
    `/manage/changes?created=${result.changeId}${result.conflict ? "&conflict=1" : ""}` as Route,
  );
}

export async function revokeChangeAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("starosta", "admin");
  const changeId = z.uuid().parse(formData.get("changeId"));
  await revokeChange(user.id, changeId);
  revalidatePath("/", "layout");
  redirect("/manage/changes?revoked=1");
}
