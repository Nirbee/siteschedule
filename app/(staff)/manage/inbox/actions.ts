"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/current";
import { deleteItems, sortItems, type Result } from "@/lib/services/inbox";

const refresh = () => revalidatePath("/", "layout");

export async function sortItemsAction(ids: string[], target: unknown): Promise<Result> {
  const { user } = await requireRole("starosta", "admin");
  const result = await sortItems(user, ids, target);
  if (result.ok) refresh();
  return result;
}

export async function deleteItemsAction(ids: string[]): Promise<Result> {
  const { user } = await requireRole("starosta", "admin");
  const result = await deleteItems(user, ids);
  if (result.ok) refresh();
  return result;
}
