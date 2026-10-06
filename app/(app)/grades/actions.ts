"use server";

import { z } from "zod";
import { requireMember } from "@/lib/auth/current";
import { setMark, type Result } from "@/lib/services/grades";

/** The student's own mark (attendance or points); null clears it. */
export async function setMarkAction(
  subjectId: string,
  key: string,
  value: number | null,
): Promise<Result> {
  const { user } = await requireMember();
  return setMark(user.id, z.uuid().parse(subjectId), key, value);
}
