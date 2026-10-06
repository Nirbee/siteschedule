"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/current";
import { setAssignmentDone } from "@/lib/services/tasks";

/** A student's own «сделано» mark. */
export async function setDoneAction(assignmentId: string, done: boolean): Promise<void> {
  const { user } = await requireMember();
  await setAssignmentDone(user.id, z.uuid().parse(assignmentId), z.boolean().parse(done));
  revalidatePath("/", "layout");
}
