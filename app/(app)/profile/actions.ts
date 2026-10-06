"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/current";
import { setOwnFullName } from "@/lib/services/topics";

export type NameState = { ok?: boolean; error?: string };

export async function saveFullNameAction(_prev: NameState, formData: FormData): Promise<NameState> {
  const { user } = await requireMember();
  const result = await setOwnFullName(user.id, String(formData.get("fullName") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return { ok: true };
}
