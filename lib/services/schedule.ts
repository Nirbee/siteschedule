// Schedule reads and date-specific changes. Calculation itself lives in lib/schedule (pure).
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditLog,
  scheduleChangeGroups,
  scheduleChanges,
  scheduleEntries,
  scheduleEntryGroups,
  semesters,
  subjects,
  timeSlots,
  users,
} from "@/lib/db/schema";
import { addDays, shortTime, todayInMoscow, type IsoDate } from "@/lib/schedule/dates";
import { describeChange, describeStoredChange } from "@/lib/schedule/describe";
import { changeInput, type ChangeInput } from "@/lib/schedule/inputs";
import { baseEntriesOn, resolveDay } from "@/lib/schedule/resolve";
import type { ChangeInfo, ResolvedLesson, ScheduleData } from "@/lib/schedule/types";

export type Semester = typeof semesters.$inferSelect;

/** How far ahead starostas can pick existing lessons to change. */
export const CHANGE_WINDOW_DAYS = 14;

export async function getCurrentSemester(): Promise<Semester | undefined> {
  const [semester] = await db().select().from(semesters).where(eq(semesters.isCurrent, true));
  return semester;
}

/** Loads the whole current semester (a few hundred rows at most). */
export async function loadScheduleData(): Promise<ScheduleData | null> {
  const semester = await getCurrentSemester();
  if (!semester) return null;

  const [slotRows, subjectRows, entryRows, entryGroupRows, changeRows] = await Promise.all([
    db().select().from(timeSlots),
    db().select().from(subjects).where(eq(subjects.semesterId, semester.id)),
    db()
      .select({ entry: scheduleEntries })
      .from(scheduleEntries)
      .innerJoin(subjects, eq(subjects.id, scheduleEntries.subjectId))
      .where(eq(subjects.semesterId, semester.id)),
    db().select().from(scheduleEntryGroups),
    db().select().from(scheduleChanges).where(isNull(scheduleChanges.revokedAt)),
  ]);
  const changeIds = changeRows.map((c) => c.id);
  const changeGroupRows = changeIds.length
    ? await db()
        .select()
        .from(scheduleChangeGroups)
        .where(inArray(scheduleChangeGroups.changeId, changeIds))
    : [];

  return {
    semester: {
      startsOn: semester.startsOn,
      endsOn: semester.endsOn,
      firstWeekParity: semester.firstWeekParity === "denominator" ? "denominator" : "numerator",
    },
    slots: new Map(
      slotRows.map((s) => [s.n, { start: shortTime(s.startsAt), end: shortTime(s.endsAt) }]),
    ),
    subjects: new Map(
      subjectRows.map((s) => [
        s.id,
        { id: s.id, name: s.name, shortName: s.shortName, teacher: s.teacher },
      ]),
    ),
    entries: entryRows.map(({ entry }) => ({
      ...entry,
      groupIds: entryGroupRows.filter((g) => g.entryId === entry.id).map((g) => g.groupId),
    })),
    changes: changeRows.map((c) =>
      toChangeInfo(
        c,
        changeGroupRows.filter((g) => g.changeId === c.id),
      ),
    ),
  };
}

function toChangeInfo(
  c: typeof scheduleChanges.$inferSelect,
  groups: { groupId: string }[],
): ChangeInfo {
  const time = (t: string | null) => (t ? shortTime(t) : null);
  return {
    ...c,
    startsAt: time(c.startsAt),
    endsAt: time(c.endsAt),
    newStartsAt: time(c.newStartsAt),
    newEndsAt: time(c.newEndsAt),
    groupIds: groups.map((g) => g.groupId),
  };
}

/** Existing lessons a starosta can change: base lessons from today for the next two weeks. */
export function changeableLessons(
  data: ScheduleData,
  groupId: string,
  today: IsoDate = todayInMoscow(),
): (ResolvedLesson & { entryId: string; groupIds: string[] })[] {
  const result: (ResolvedLesson & { entryId: string; groupIds: string[] })[] = [];
  for (let i = 0; i < CHANGE_WINDOW_DAYS; i++) {
    const date = addDays(today, i);
    for (const lesson of resolveDay(data, date, groupId)) {
      if (!lesson.entryId || lesson.kind === "self_study" || lesson.status === "moved_in") continue;
      const entry = data.entries.find((e) => e.id === lesson.entryId);
      if (entry) result.push({ ...lesson, entryId: lesson.entryId, groupIds: entry.groupIds });
    }
  }
  return result;
}

export type CreateChangeResult =
  | { ok: true; changeId: string; description: string; conflict: boolean }
  | { ok: false; error: string };

/** Validates and stores a change made by a starosta. */
export async function createChange(
  actorId: string,
  raw: ChangeInput,
  { today = todayInMoscow() }: { today?: IsoDate } = {},
): Promise<CreateChangeResult> {
  const parsed = changeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка" };
  const input = parsed.data;

  const data = await loadScheduleData();
  if (!data) return { ok: false, error: "Не задан текущий семестр" };
  const { semester } = data;
  const inSemester = (date: IsoDate) => date >= semester.startsOn && date <= semester.endsOn;
  const lastChangeable = addDays(today, CHANGE_WINDOW_DAYS - 1);

  const targetOf = (t: { slotN: number } | { startsAt: string; endsAt: string }) =>
    "slotN" in t
      ? { slotN: t.slotN, startsAt: null, endsAt: null }
      : { slotN: null, startsAt: t.startsAt, endsAt: t.endsAt };
  if ("target" in input && "slotN" in input.target && !data.slots.has(input.target.slotN)) {
    return { ok: false, error: "Такой пары нет в сетке звонков" };
  }
  if ("newSubjectId" in input && !data.subjects.has(input.newSubjectId)) {
    return { ok: false, error: "Предмет не найден" };
  }

  let values: typeof scheduleChanges.$inferInsert;
  if (input.type === "add") {
    if (!inSemester(input.date) || input.date < today) {
      return { ok: false, error: "Дата доп. пары — от сегодня до конца семестра" };
    }
    const target = targetOf(input.target);
    values = {
      type: "add",
      date: input.date,
      ...target,
      newSubjectId: input.newSubjectId,
      newKind: input.newKind,
      newRoom: input.newRoom,
      newTeacher: input.newTeacher,
      comment: input.comment,
      authorId: actorId,
    };
  } else {
    const entry = data.entries.find((e) => e.id === input.entryId);
    if (!entry) return { ok: false, error: "Пара не найдена" };
    if (input.date < today || input.date > lastChangeable) {
      return { ok: false, error: "Изменить можно пары на ближайшие две недели" };
    }
    if (!input.groupIds.every((g) => entry.groupIds.includes(g))) {
      return { ok: false, error: "У этих групп нет такой пары" };
    }
    if (!input.groupIds.some((g) => baseEntriesOn(data, input.date, g).includes(entry))) {
      return { ok: false, error: "В этот день такой пары нет по расписанию" };
    }
    values = {
      type: input.type,
      date: input.date,
      entryId: entry.id,
      comment: input.comment,
      authorId: actorId,
    };
    if (input.type === "replace") {
      Object.assign(values, {
        newSubjectId: input.newSubjectId,
        newKind: input.newKind ?? null,
        newRoom: input.newRoom,
      });
    } else if (input.type === "room") {
      values.newRoom = input.newRoom;
    } else if (input.type === "move") {
      if (!inSemester(input.newDate) || input.newDate < today) {
        return { ok: false, error: "Перенести можно на дату от сегодня до конца семестра" };
      }
      const target = targetOf(input.target);
      if (input.newDate === input.date && target.slotN === entry.slotN) {
        return { ok: false, error: "Новое время совпадает со старым" };
      }
      Object.assign(values, {
        newDate: input.newDate,
        newSlotN: target.slotN,
        newStartsAt: target.startsAt,
        newEndsAt: target.endsAt,
        newRoom: input.newRoom,
      });
    }
  }

  const changeId = await db().transaction(async (tx) => {
    const [row] = await tx.insert(scheduleChanges).values(values).returning();
    if (!row) throw new Error("change insert returned nothing");
    await tx
      .insert(scheduleChangeGroups)
      .values(input.groupIds.map((groupId) => ({ changeId: row.id, groupId })));
    await tx.insert(auditLog).values({
      actorId,
      action: "schedule_change.create",
      entity: "schedule_change",
      entityId: row.id,
      payload: input,
    });
    return row.id;
  });

  // Re-read to describe the change and detect conflicts at the affected date.
  const after = (await loadScheduleData())!;
  const stored = after.changes.find((c) => c.id === changeId)!;
  const description = describeStoredChange(after, stored);
  const affectedDate = stored.type === "move" ? stored.newDate! : stored.date;
  const conflict = input.groupIds.some((g) =>
    resolveDay(after, affectedDate, g).some((l) => l.conflict && l.changeId === changeId),
  );
  return {
    ok: true,
    changeId,
    description: description ? describeChange(description) : "",
    conflict,
  };
}

export async function revokeChange(actorId: string, changeId: string): Promise<boolean> {
  const revoked = await db()
    .update(scheduleChanges)
    .set({ revokedAt: new Date(), revokedBy: actorId })
    .where(and(eq(scheduleChanges.id, changeId), isNull(scheduleChanges.revokedAt)))
    .returning({ id: scheduleChanges.id });
  if (revoked.length === 0) return false;
  await db().insert(auditLog).values({
    actorId,
    action: "schedule_change.revoke",
    entity: "schedule_change",
    entityId: changeId,
  });
  return true;
}

export interface ChangeHistoryItem {
  id: string;
  type: ChangeInfo["type"];
  date: IsoDate;
  affectedDate: IsoDate;
  description: string;
  comment: string | null;
  authorName: string;
  createdAt: Date;
  revokedAt: Date | null;
}

/** Recent changes (including revoked) for the history page. */
export async function listChangeHistory(limit = 100): Promise<ChangeHistoryItem[]> {
  const data = await loadScheduleData();
  if (!data) return [];
  const rows = await db()
    .select({ change: scheduleChanges, authorName: users.displayName })
    .from(scheduleChanges)
    .innerJoin(users, eq(users.id, scheduleChanges.authorId))
    .orderBy(desc(scheduleChanges.createdAt))
    .limit(limit);
  const groupRows = rows.length
    ? await db()
        .select()
        .from(scheduleChangeGroups)
        .where(
          inArray(
            scheduleChangeGroups.changeId,
            rows.map((r) => r.change.id),
          ),
        )
    : [];

  return rows.map(({ change, authorName }) => {
    const info = toChangeInfo(
      change,
      groupRows.filter((g) => g.changeId === change.id),
    );
    const description = describeStoredChange(data, info);
    return {
      id: change.id,
      type: change.type,
      date: change.date,
      affectedDate: change.type === "move" && change.newDate ? change.newDate : change.date,
      description: description ? describeChange(description) : "Изменение расписания",
      comment: change.comment,
      authorName,
      createdAt: change.createdAt,
      revokedAt: change.revokedAt,
    };
  });
}
