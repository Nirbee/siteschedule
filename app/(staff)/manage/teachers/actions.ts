"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { deleteTeacher, saveTeacher } from "@/lib/services/teachers";

export type TeacherFormState = { error?: string };

export async function saveTeacherAction(
  _prev: TeacherFormState,
  formData: FormData,
): Promise<TeacherFormState> {
  const { user } = await requireRole("starosta", "admin");
  const rawId = String(formData.get("id") ?? "");
  const id = rawId ? z.uuid().parse(rawId) : null;
  const photo = formData.get("photo");
  const bytes =
    photo instanceof File && photo.size > 0 ? new Uint8Array(await photo.arrayBuffer()) : null;
  const result = await saveTeacher(
    user,
    id,
    {
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      note: String(formData.get("note") ?? ""),
      subjectIds: formData.getAll("subjectId").map(String),
    },
    bytes,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/teachers");
  redirect(`/teachers#t-${result.id}` as Route);
}

export async function deleteTeacherAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("starosta", "admin");
  await deleteTeacher(user, z.uuid().parse(formData.get("id")));
  revalidatePath("/teachers");
  redirect("/teachers");
}
