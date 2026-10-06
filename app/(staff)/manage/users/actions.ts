"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { createAdminLoginLink } from "@/lib/services/auth";
import { updateMember } from "@/lib/services/members";
import { fullNameInput } from "@/lib/topics/inputs";

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("access"), value: z.stringbool() }),
  z.object({ kind: z.literal("blocked"), value: z.stringbool() }),
  z.object({ kind: z.literal("role"), value: z.enum(["student", "starosta", "admin"]) }),
  z.object({
    kind: z.literal("fullName"),
    value: z.union([fullNameInput, z.literal("").transform(() => null)]),
  }),
  z.object({
    kind: z.literal("group"),
    value: z.union([z.uuid(), z.literal("").transform(() => null)]),
  }),
]);

export async function updateMemberAction(formData: FormData): Promise<void> {
  const { user: admin } = await requireRole("admin");
  const userId = z.uuid().parse(formData.get("userId"));
  const parsed = changeSchema.safeParse({
    kind: formData.get("kind"),
    value: formData.get("value"),
  });
  if (!parsed.success) return; // e.g. a malformed name: the field simply keeps its old value
  const change = parsed.data;
  // An admin cannot lock themselves out.
  if (userId === admin.id && change.kind !== "group" && change.kind !== "fullName") return;

  await updateMember(admin.id, userId, change);
  revalidatePath("/manage/users");
}

export type LoginLinkState = { url?: string; expiresAt?: string };

export async function createLoginLinkAction(
  _prev: LoginLinkState,
  formData: FormData,
): Promise<LoginLinkState> {
  const { user: admin } = await requireRole("admin");
  const userId = z.uuid().parse(formData.get("userId"));
  const { code, expiresAt } = await createAdminLoginLink(admin.id, userId);
  return {
    url: new URL(`/login/link/${code}`, env().APP_URL).toString(),
    expiresAt: expiresAt.toISOString(),
  };
}
