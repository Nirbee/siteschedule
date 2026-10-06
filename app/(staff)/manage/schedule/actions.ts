"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { isoDate } from "@/lib/schedule/inputs";
import {
  deleteEntry,
  deleteSubject,
  endEntry,
  saveEntry,
  saveSubject,
  updateSemester,
  type Result,
} from "@/lib/services/schedule-admin";

async function staff() {
  return (await requireRole("starosta", "admin")).user;
}

function done(result: Result, okMessage: string, anchor = ""): never {
  revalidatePath("/", "layout");
  const query = result.ok
    ? `ok=${encodeURIComponent(okMessage)}`
    : `error=${encodeURIComponent(result.error)}`;
  redirect(`/manage/schedule?${query}${anchor}` as Route);
}

const optionalId = (value: FormDataEntryValue | null) => (value ? z.uuid().parse(value) : null);
const text = (formData: FormData, name: string) => formData.get(name)?.toString() ?? "";

export async function saveSemesterAction(formData: FormData) {
  const user = await staff();
  const result = await updateSemester(user.id, {
    title: text(formData, "title"),
    startsOn: text(formData, "startsOn"),
    endsOn: text(formData, "endsOn"),
    firstWeekParity: text(formData, "firstWeekParity"),
  });
  done(result, "Семестр сохранён", "#semester");
}

export async function saveSubjectAction(formData: FormData) {
  const user = await staff();
  const result = await saveSubject(user.id, optionalId(formData.get("id")), {
    name: text(formData, "name"),
    shortName: text(formData, "shortName"),
    teacher: text(formData, "teacher"),
    aliases: text(formData, "aliases"),
  });
  done(result, "Предмет сохранён", "#subjects");
}

export async function deleteSubjectAction(formData: FormData) {
  const user = await staff();
  done(
    await deleteSubject(user.id, z.uuid().parse(formData.get("id"))),
    "Предмет удалён",
    "#subjects",
  );
}

export async function saveEntryAction(formData: FormData) {
  const user = await staff();
  const result = await saveEntry(user.id, optionalId(formData.get("id")), {
    subjectId: text(formData, "subjectId"),
    weekday: text(formData, "weekday"),
    slotN: text(formData, "slotN"),
    parity: text(formData, "parity"),
    kind: text(formData, "kind"),
    room: text(formData, "room"),
    teacher: text(formData, "teacher"),
    groupIds: formData.getAll("groupIds").map(String),
    validFrom: text(formData, "validFrom") || null,
    validTo: text(formData, "validTo") || null,
  });
  done(result, "Пара сохранена", "#entries");
}

export async function deleteEntryAction(formData: FormData) {
  const user = await staff();
  done(await deleteEntry(user.id, z.uuid().parse(formData.get("id"))), "Пара удалена", "#entries");
}

export async function endEntryAction(formData: FormData) {
  const user = await staff();
  const id = z.uuid().parse(formData.get("id"));
  const lastDay = isoDate.safeParse(formData.get("lastDay"));
  if (!lastDay.success) done({ ok: false, error: "Укажите дату" }, "");
  done(await endEntry(user.id, id, lastDay.data), "Пара завершена", "#entries");
}
