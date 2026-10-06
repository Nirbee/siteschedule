// Base schedule editing: semester, subjects, recurring entries. Starosta/admin only (checked by callers).
import { and, asc, count, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db/client";
import {
  auditLog,
  controlEvents,
  scheduleChanges,
  scheduleEntries,
  scheduleEntryGroups,
  semesters,
  subjects,
  timeSlots,
  topicLists,
} from "@/lib/db/schema";
import { shortTime, type IsoDate } from "@/lib/schedule/dates";
import { entryInput, semesterInput, subjectInput } from "@/lib/schedule/inputs";
import { getCurrentSemester } from "./schedule";

export type Result = { ok: true } | { ok: false; error: string };
type Subject = typeof subjects.$inferSelect;
export type EntryRow = typeof scheduleEntries.$inferSelect & { groupIds: string[] };

async function audit(actorId: string, action: string, entityId: string, payload?: unknown) {
  await db()
    .insert(auditLog)
    .values({ actorId, action, entity: action.split(".")[0]!, entityId, payload: payload ?? null });
}

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Проверьте поля формы";

// Semester ----------------------------------------------------------------------

export async function updateSemester(actorId: string, raw: unknown): Promise<Result> {
  const parsed = semesterInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const current = await getCurrentSemester();
  if (current) {
    await db().update(semesters).set(parsed.data).where(eq(semesters.id, current.id));
    await audit(actorId, "semester.update", current.id, parsed.data);
  } else {
    const [created] = await db()
      .insert(semesters)
      .values({ ...parsed.data, isCurrent: true })
      .returning();
    await audit(actorId, "semester.create", created!.id, parsed.data);
  }
  return { ok: true };
}

export async function listTimeSlots() {
  const rows = await db().select().from(timeSlots).orderBy(asc(timeSlots.n));
  return rows.map((s) => ({ n: s.n, start: shortTime(s.startsAt), end: shortTime(s.endsAt) }));
}

// Subjects ----------------------------------------------------------------------

export async function listSubjects(): Promise<Subject[]> {
  const semester = await getCurrentSemester();
  if (!semester) return [];
  return db()
    .select()
    .from(subjects)
    .where(eq(subjects.semesterId, semester.id))
    .orderBy(asc(subjects.name));
}

export async function saveSubject(
  actorId: string,
  id: string | null,
  raw: unknown,
): Promise<Result> {
  const parsed = subjectInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const semester = await getCurrentSemester();
  if (!semester) return { ok: false, error: "Сначала задайте семестр" };

  if (id) {
    await db()
      .update(subjects)
      .set(parsed.data)
      .where(and(eq(subjects.id, id), eq(subjects.semesterId, semester.id)));
    await audit(actorId, "subject.update", id, parsed.data);
  } else {
    const [created] = await db()
      .insert(subjects)
      .values({ ...parsed.data, semesterId: semester.id })
      .returning();
    await audit(actorId, "subject.create", created!.id, parsed.data);
  }
  return { ok: true };
}

/** Only unused subjects can be deleted (no lessons, changes, control events or topic lists). */
export async function deleteSubject(actorId: string, id: string): Promise<Result> {
  const usage = await Promise.all([
    db().select({ n: count() }).from(scheduleEntries).where(eq(scheduleEntries.subjectId, id)),
    db().select({ n: count() }).from(scheduleChanges).where(eq(scheduleChanges.newSubjectId, id)),
    db().select({ n: count() }).from(controlEvents).where(eq(controlEvents.subjectId, id)),
    db().select({ n: count() }).from(topicLists).where(eq(topicLists.subjectId, id)),
  ]);
  if (usage.some(([row]) => (row?.n ?? 0) > 0)) {
    return { ok: false, error: "Предмет используется в расписании — сначала удалите его пары" };
  }
  await db().delete(subjects).where(eq(subjects.id, id));
  await audit(actorId, "subject.delete", id);
  return { ok: true };
}

// Entries -----------------------------------------------------------------------

export async function listEntries(): Promise<EntryRow[]> {
  const semester = await getCurrentSemester();
  if (!semester) return [];
  const [rows, groupRows] = await Promise.all([
    db()
      .select({ entry: scheduleEntries })
      .from(scheduleEntries)
      .innerJoin(subjects, eq(subjects.id, scheduleEntries.subjectId))
      .where(eq(subjects.semesterId, semester.id))
      .orderBy(asc(scheduleEntries.weekday), asc(scheduleEntries.slotN)),
    db().select().from(scheduleEntryGroups),
  ]);
  return rows.map(({ entry }) => ({
    ...entry,
    groupIds: groupRows.filter((g) => g.entryId === entry.id).map((g) => g.groupId),
  }));
}

export async function saveEntry(actorId: string, id: string | null, raw: unknown): Promise<Result> {
  const parsed = entryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { groupIds, ...values } = parsed.data;
  if (values.validFrom && values.validTo && values.validTo < values.validFrom) {
    return { ok: false, error: "«По» раньше, чем «с»" };
  }

  await db().transaction(async (tx) => {
    let entryId = id;
    if (entryId) {
      await tx.update(scheduleEntries).set(values).where(eq(scheduleEntries.id, entryId));
      await tx.delete(scheduleEntryGroups).where(eq(scheduleEntryGroups.entryId, entryId));
    } else {
      const [created] = await tx.insert(scheduleEntries).values(values).returning();
      entryId = created!.id;
    }
    await tx
      .insert(scheduleEntryGroups)
      .values(groupIds.map((groupId) => ({ entryId: entryId!, groupId })));
    await tx.insert(auditLog).values({
      actorId,
      action: id ? "schedule_entry.update" : "schedule_entry.create",
      entity: "schedule_entry",
      entityId: entryId,
      payload: parsed.data,
    });
  });
  return { ok: true };
}

async function hasChanges(entryId: string): Promise<boolean> {
  const [row] = await db()
    .select({ n: count() })
    .from(scheduleChanges)
    .where(eq(scheduleChanges.entryId, entryId));
  return (row?.n ?? 0) > 0;
}

/** Lessons with changes cannot be deleted (history would break) — end them instead. */
export async function deleteEntry(actorId: string, id: string): Promise<Result> {
  if (await hasChanges(id)) {
    return {
      ok: false,
      error: "У этой пары есть изменения в истории. Вместо удаления завершите её с нужной даты.",
    };
  }
  await db().delete(scheduleEntries).where(eq(scheduleEntries.id, id));
  await audit(actorId, "schedule_entry.delete", id);
  return { ok: true };
}

/** «Завершить с даты»: the lesson no longer happens from `lastDay + 1`. */
export async function endEntry(actorId: string, id: string, lastDay: IsoDate): Promise<Result> {
  const [entry] = await db().select().from(scheduleEntries).where(eq(scheduleEntries.id, id));
  if (!entry) return { ok: false, error: "Пара не найдена" };
  if (entry.validFrom && lastDay < entry.validFrom) {
    return { ok: false, error: "Дата раньше начала действия пары" };
  }
  await db().update(scheduleEntries).set({ validTo: lastDay }).where(eq(scheduleEntries.id, id));
  await audit(actorId, "schedule_entry.end", id, { validTo: lastDay });
  return { ok: true };
}
