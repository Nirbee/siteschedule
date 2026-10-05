"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { chooseGroup } from "@/lib/services/members";

export async function chooseGroupAction(formData: FormData): Promise<void> {
  const { user } = await requireUser();
  const groupId = z.uuid().parse(formData.get("groupId"));
  await chooseGroup(user.id, groupId);
  redirect("/");
}
