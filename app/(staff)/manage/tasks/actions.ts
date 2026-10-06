"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import {
  deleteAssignment,
  deleteControlEvent,
  saveAssignment,
  saveControlEvent,
} from "@/lib/services/tasks";
import type { AssignmentInput, ControlEventInput } from "@/lib/tasks/inputs";

export type TaskFormState = { error?: string };

function readForm(formData: FormData): { id: string | null; payload: unknown } | null {
  const rawId = String(formData.get("id") ?? "");
  const id = rawId ? z.uuid().safeParse(rawId) : null;
  if (id && !id.success) return null;
  try {
    return { id: id?.data ?? null, payload: JSON.parse(String(formData.get("payload") ?? "")) };
  } catch {
    return null;
  }
}

export async function saveAssignmentAction(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const { user } = await requireRole("starosta", "admin");
  const form = readForm(formData);
  if (!form) return { error: "Не удалось прочитать форму" };
  // saveAssignment validates the payload with zod.
  const result = await saveAssignment(user, form.id, form.payload as AssignmentInput);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/tasks#a-${result.id}` as Route);
}

export async function deleteAssignmentAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("starosta", "admin");
  await deleteAssignment(user, z.uuid().parse(formData.get("id")));
  revalidatePath("/", "layout");
  redirect("/tasks");
}

export async function saveControlEventAction(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const { user } = await requireRole("starosta", "admin");
  const form = readForm(formData);
  if (!form) return { error: "Не удалось прочитать форму" };
  const result = await saveControlEvent(user, form.id, form.payload as ControlEventInput);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/tasks/control/${result.id}` as Route);
}

export async function deleteControlEventAction(formData: FormData): Promise<void> {
  const { user } = await requireRole("starosta", "admin");
  await deleteControlEvent(user, z.uuid().parse(formData.get("id")));
  revalidatePath("/", "layout");
  redirect("/tasks?f=control");
}
