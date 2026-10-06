"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { ToolUnavailable, recognizePhoto } from "@/lib/ingest/text-index";
import {
  addTopics,
  assignMember,
  classCodeState,
  createTopicList,
  deleteTopic,
  deleteTopicList,
  openForClass,
  removeMember,
  setOpensAt,
  setTopicDone,
  updateTopic,
  updateTopicList,
} from "@/lib/services/topics";
import { moscowDateTime } from "@/lib/topics/inputs";
import { parseTopics } from "@/lib/topics/parse";

export type FormState = { error?: string; ok?: boolean };

const staff = () => requireRole("starosta", "admin");
const listFields = (formData: FormData) => ({
  subjectId: String(formData.get("subjectId") ?? ""),
  title: String(formData.get("title") ?? ""),
  defaultCapacity: String(formData.get("defaultCapacity") ?? "1"),
  pickDeadline: String(formData.get("pickDeadline") ?? ""),
  rules: String(formData.get("rules") ?? ""),
});
const refresh = (listId?: string) => {
  revalidatePath("/topics", "layout");
  revalidatePath("/manage/topics", "layout");
  if (listId) revalidatePath(`/manage/topics/${listId}`);
};

export async function createTopicListAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user } = await staff();
  const items = parseTopics(String(formData.get("topics") ?? ""));
  const result = await createTopicList(user, listFields(formData), items);
  if (!result.ok) return { error: result.error };
  refresh();
  redirect(`/manage/topics/${result.id}` as Route);
}

export async function updateTopicListAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user } = await staff();
  const id = z.uuid().parse(formData.get("listId"));
  const result = await updateTopicList(user, id, listFields(formData));
  if (!result.ok) return { error: result.error };
  refresh(id);
  return { ok: true };
}

export async function deleteTopicListAction(formData: FormData): Promise<void> {
  const { user } = await staff();
  await deleteTopicList(user, z.uuid().parse(formData.get("listId")));
  refresh();
  redirect("/topics");
}

export async function addTopicsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await staff();
  const id = z.uuid().parse(formData.get("listId"));
  const result = await addTopics(user, id, parseTopics(String(formData.get("topics") ?? "")));
  if (!result.ok) return { error: result.error };
  refresh(id);
  return { ok: true };
}

export async function updateTopicAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await staff();
  const listId = z.uuid().parse(formData.get("listId"));
  const result = await updateTopic(user, z.uuid().parse(formData.get("topicId")), {
    title: String(formData.get("title") ?? ""),
    details: String(formData.get("details") ?? ""),
    capacity: String(formData.get("capacity") ?? "1"),
    dueDate: String(formData.get("dueDate") ?? "") || null,
    dueOrder: String(formData.get("dueOrder") ?? "") || null,
  });
  if (!result.ok) return { error: result.error };
  refresh(listId);
  return { ok: true };
}

export async function topicDoneAction(formData: FormData): Promise<void> {
  const { user } = await staff();
  await setTopicDone(
    user,
    z.uuid().parse(formData.get("topicId")),
    formData.get("done") === "true",
  );
  refresh(z.uuid().parse(formData.get("listId")));
}

export async function deleteTopicAction(formData: FormData): Promise<void> {
  const { user } = await staff();
  await deleteTopic(user, z.uuid().parse(formData.get("topicId")));
  refresh(z.uuid().parse(formData.get("listId")));
}

export async function assignMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await staff();
  const listId = z.uuid().parse(formData.get("listId"));
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Выберите человека" };
  const result = await assignMember(user, z.uuid().parse(formData.get("topicId")), userId.data);
  if (!result.ok) return { error: result.error };
  refresh(listId);
  return { ok: true };
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const { user } = await staff();
  await removeMember(
    user,
    z.uuid().parse(formData.get("topicId")),
    z.uuid().parse(formData.get("userId")),
  );
  refresh(z.uuid().parse(formData.get("listId")));
}

export async function openForClassAction(formData: FormData): Promise<void> {
  const { user } = await staff();
  const listId = z.uuid().parse(formData.get("listId"));
  await openForClass(user, listId);
  refresh(listId);
  redirect(`/code/${listId}` as Route);
}

/** «Открыть для всех сейчас», a scheduled time, or cancelling the schedule. */
export async function setOpensAtAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await staff();
  const listId = z.uuid().parse(formData.get("listId"));
  const mode = String(formData.get("mode"));
  let at: Date | null = null;
  if (mode === "now") at = new Date();
  else if (mode === "schedule") {
    const parsed = moscowDateTime.safeParse(String(formData.get("opensAt") ?? ""));
    if (!parsed.success || !parsed.data) return { error: "Укажите дату и время" };
    if (parsed.data <= new Date()) return { error: "Это время уже прошло" };
    at = parsed.data;
  }
  await setOpensAt(user, listId, at);
  refresh(listId);
  return { ok: true };
}

export async function classCodeAction(listId: string) {
  const { user } = await staff();
  return classCodeState(user, z.uuid().parse(listId));
}

/** Photo of the printed sheet → text for the topics field. */
export async function recognizeTopicsAction(
  formData: FormData,
): Promise<{ text?: string; error?: string }> {
  await staff();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите фото" };
  if (file.size > 15 * 1024 * 1024) return { error: "Фото больше 15 МБ" };
  try {
    const text = await recognizePhoto(new Uint8Array(await file.arrayBuffer()), file.name);
    const topics = parseTopics(text);
    if (topics.length === 0)
      return { error: "Не удалось разобрать текст — попробуйте фото ровнее" };
    return { text: topics.map((t, i) => `${i + 1}. ${t.title}`).join("\n") };
  } catch (error) {
    if (error instanceof ToolUnavailable)
      return { error: "Распознавание работает только на сервере" };
    return { error: "Не удалось распознать фото" };
  }
}
