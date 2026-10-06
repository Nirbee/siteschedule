"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/current";
import { deleteMedia, renameMedia, setNoteTitle, type Result } from "@/lib/services/library";

export type ActionState = { error?: string; ok?: boolean };

function done(result: Result): ActionState {
  if (!result.ok) return { error: result.error };
  revalidatePath("/library", "layout");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteMediaAction(_prev: ActionState, formData: FormData) {
  const { user } = await requireMember();
  return done(await deleteMedia(user, z.uuid().parse(formData.get("id"))));
}

export async function renameMediaAction(_prev: ActionState, formData: FormData) {
  const { user } = await requireMember();
  const title = z
    .string()
    .max(200)
    .parse(formData.get("title") ?? "");
  return done(await renameMedia(user, z.uuid().parse(formData.get("id")), title));
}

export async function setNoteTitleAction(_prev: ActionState, formData: FormData) {
  const { user } = await requireMember();
  const title = z
    .string()
    .max(200)
    .parse(formData.get("title") ?? "");
  return done(await setNoteTitle(user, z.uuid().parse(formData.get("id")), title));
}
