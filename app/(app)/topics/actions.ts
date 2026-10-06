"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/current";
import {
  enterClassCode,
  leaveTopic,
  setOwnFullName,
  takeTopic,
  type PickResult,
} from "@/lib/services/topics";

export type TopicActionResult = { ok: true } | { ok: false; error: string; needName?: boolean };

const plain = (result: PickResult): TopicActionResult =>
  result.ok
    ? { ok: true }
    : { ok: false, error: result.error, ...("needName" in result ? { needName: true } : {}) };

export async function takeTopicAction(topicId: string): Promise<TopicActionResult> {
  const { user } = await requireMember();
  const result = await takeTopic(user, z.uuid().parse(topicId));
  revalidatePath("/topics", "layout");
  return plain(result);
}

export async function leaveTopicAction(topicId: string): Promise<TopicActionResult> {
  const { user } = await requireMember();
  const result = await leaveTopic(user, z.uuid().parse(topicId));
  revalidatePath("/topics", "layout");
  return plain(result);
}

/** Saves «Фамилия Имя», then takes the topic the person was going for. */
export async function setNameAndTakeAction(
  topicId: string,
  fullName: string,
): Promise<TopicActionResult> {
  const { user } = await requireMember();
  const saved = await setOwnFullName(user.id, z.string().max(200).parse(fullName));
  if (!saved.ok) return saved;
  const result = await takeTopic({ ...user, fullName: fullName.trim() }, z.uuid().parse(topicId));
  revalidatePath("/topics", "layout");
  return plain(result);
}

export async function enterCodeAction(listId: string, code: string): Promise<TopicActionResult> {
  const { user } = await requireMember();
  const result = await enterClassCode(user, z.uuid().parse(listId), z.string().max(20).parse(code));
  revalidatePath("/topics", "layout");
  return result;
}
