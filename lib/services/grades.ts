// Personal points tracker («Успеваемость»): each student marks their own attendance and
// points; the site estimates module totals by the subject's scheme. Staff see everyone's
// estimates to warn those who fall short. Only approximate — the teacher's count decides.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { gradeMarks, gradingSchemes, groups, media, subjects, users } from "@/lib/db/schema";
import {
  computeGrades,
  gradingConfig,
  type GradeLesson,
  type GradeResult,
  type GradingConfig,
  type GradingConfigInput,
} from "@/lib/grades/scheme";
import { daysBetween, todayInMoscow } from "@/lib/schedule/dates";
import { subjectLessons } from "@/lib/tasks/place";
import { shortGroup } from "@/lib/topics/rules";
import { getCurrentSemester, loadScheduleData } from "./schedule";
import { teacherOfSubject } from "./teachers";
import type { User } from "./users";

type Actor = Pick<User, "id" | "role">;
const isStaff = (actor: Actor) => actor.role === "starosta" || actor.role === "admin";
export type Result = { ok: true } | { ok: false; error: string };

export async function getScheme(subjectId: string): Promise<GradingConfig | null> {
  const [row] = await db()
    .select()
    .from(gradingSchemes)
    .where(eq(gradingSchemes.subjectId, subjectId));
  if (!row) return null;
  const parsed = gradingConfig.safeParse(row.config);
  return parsed.success ? parsed.data : null;
}

export async function saveScheme(
  actor: Actor,
  subjectId: string,
  raw: GradingConfigInput,
): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Систему баллов задают старосты" };
  const parsed = gradingConfig.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const config = parsed.data;
  if (config.items.some((i) => i.module >= config.modules.length))
    return { ok: false, error: "Пункт указывает на несуществующий модуль" };
  await db()
    .insert(gradingSchemes)
    .values({ subjectId, config, updatedBy: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gradingSchemes.subjectId,
      set: { config, updatedBy: actor.id, updatedAt: new Date() },
    });
  return { ok: true };
}

export async function deleteScheme(actor: Actor, subjectId: string): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Это могут только старосты" };
  await db().delete(gradingSchemes).where(eq(gradingSchemes.subjectId, subjectId));
  return { ok: true };
}

/** Subjects of the current semester that have a scheme. */
export async function gradedSubjects(): Promise<{ id: string; name: string }[]> {
  const semester = await getCurrentSemester();
  if (!semester) return [];
  return db()
    .select({ id: subjects.id, name: subjects.name })
    .from(gradingSchemes)
    .innerJoin(subjects, eq(subjects.id, gradingSchemes.subjectId))
    .where(eq(subjects.semesterId, semester.id))
    .orderBy(asc(subjects.name));
}

/** Lessons of the subject this semester (taking place, per the group's schedule). */
export async function gradeLessons(groupId: string, subjectId: string): Promise<GradeLesson[]> {
  const data = await loadScheduleData();
  if (!data) return [];
  const days = daysBetween(data.semester.startsOn, data.semester.endsOn) + 1;
  return subjectLessons(data, groupId, subjectId, data.semester.startsOn, days).map((l) => ({
    date: l.date,
    slotN: l.slotN,
    start: l.time.start,
    kind: l.kind,
  }));
}

async function marksOf(userIds: string[], subjectId: string) {
  const rows = userIds.length
    ? await db()
        .select()
        .from(gradeMarks)
        .where(and(eq(gradeMarks.subjectId, subjectId), inArray(gradeMarks.userId, userIds)))
    : [];
  const byUser = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const marks = byUser.get(r.userId) ?? new Map<string, number>();
    marks.set(r.key, r.value);
    byUser.set(r.userId, marks);
  }
  return byUser;
}

export async function myGrades(
  user: Pick<User, "id" | "groupId">,
  subjectId: string,
): Promise<{ config: GradingConfig; result: GradeResult } | null> {
  const config = await getScheme(subjectId);
  if (!config || !user.groupId) return null;
  const [lessons, marks] = await Promise.all([
    gradeLessons(user.groupId, subjectId),
    marksOf([user.id], subjectId),
  ]);
  return {
    config,
    result: computeGrades(config, lessons, marks.get(user.id) ?? new Map(), todayInMoscow()),
  };
}

const markKey = z
  .string()
  .regex(/^(att:\d{4}-\d{2}-\d{2}\|(\d{1,2}|@\d{2}:\d{2})|item:[a-z0-9_-]{1,24}|adj:\d)$/);

/** A student's own mark; null removes it. */
export async function setMark(
  userId: string,
  subjectId: string,
  key: string,
  value: number | null,
): Promise<Result> {
  const k = markKey.safeParse(key);
  const v = z.number().min(-1000).max(1000).nullable().safeParse(value);
  if (!k.success || !v.success) return { ok: false, error: "Некорректное значение" };
  if (v.data === null) {
    await db()
      .delete(gradeMarks)
      .where(
        and(
          eq(gradeMarks.userId, userId),
          eq(gradeMarks.subjectId, subjectId),
          eq(gradeMarks.key, k.data),
        ),
      );
  } else {
    await db()
      .insert(gradeMarks)
      .values({ userId, subjectId, key: k.data, value: v.data })
      .onConflictDoUpdate({
        target: [gradeMarks.userId, gradeMarks.subjectId, gradeMarks.key],
        set: { value: v.data, updatedAt: new Date() },
      });
  }
  return { ok: true };
}

export interface OverviewRow {
  userId: string;
  name: string;
  group: string | null;
  filled: boolean;
  modules: { points: number; min: number; status: "ok" | "possible" | "short" }[];
  total: number;
  grade: string;
}

/** Everyone's estimate for a subject (staff only), the most worrying first. */
export async function gradesOverview(actor: Actor, subjectId: string): Promise<OverviewRow[]> {
  if (!isStaff(actor)) return [];
  const config = await getScheme(subjectId);
  if (!config) return [];
  const people = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      displayName: users.displayName,
      groupId: users.groupId,
      groupCode: groups.code,
    })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(and(eq(users.hasAccess, true), eq(users.isBlocked, false)));
  const marks = await marksOf(
    people.map((p) => p.id),
    subjectId,
  );
  const lessonsByGroup = new Map<string, GradeLesson[]>();
  const today = todayInMoscow();
  const rows: OverviewRow[] = [];
  for (const p of people) {
    if (!p.groupId) continue;
    if (!lessonsByGroup.has(p.groupId))
      lessonsByGroup.set(p.groupId, await gradeLessons(p.groupId, subjectId));
    const own = marks.get(p.id);
    const result = computeGrades(config, lessonsByGroup.get(p.groupId)!, own ?? new Map(), today);
    rows.push({
      userId: p.id,
      name: p.fullName ?? p.displayName,
      group: shortGroup(p.groupCode),
      filled: Boolean(own?.size),
      modules: result.modules.map((m) => ({ points: m.points, min: m.min, status: m.status })),
      total: result.total,
      grade: result.grade,
    });
  }
  // Can't reach a minimum → still can → hasn't filled anything → fine.
  const worry = (r: OverviewRow) =>
    !r.filled
      ? 2
      : r.modules.some((m) => m.status === "short")
        ? 0
        : r.modules.some((m) => m.status === "possible")
          ? 1
          : 3;
  return rows.sort((a, b) => worry(a) - worry(b) || a.name.localeCompare(b.name, "ru"));
}

/** Everything the personal tracker page needs. */
export async function trackerData(user: Pick<User, "id" | "groupId">, subjectId: string) {
  const config = await getScheme(subjectId);
  if (!config || !user.groupId) return null;
  const fileIds = config.extras.flatMap((x) => (x.mediaId ? [x.mediaId] : []));
  const [lessons, marks, teacher, files] = await Promise.all([
    gradeLessons(user.groupId, subjectId),
    marksOf([user.id], subjectId),
    teacherOfSubject(subjectId, config.teacherId),
    fileIds.length
      ? db()
          .select({ id: media.id, title: media.title, fileName: media.fileName })
          .from(media)
          .where(and(inArray(media.id, fileIds), isNull(media.deletedAt)))
      : Promise.resolve([]),
  ]);
  return {
    config,
    lessons,
    marks: [...(marks.get(user.id) ?? new Map<string, number>())],
    teacher,
    extras: config.extras.map((x) => {
      const file = files.find((f) => f.id === x.mediaId);
      return {
        ...x,
        mediaId: file ? x.mediaId : null,
        fileName: file ? (file.title ?? file.fileName) : null,
      };
    }),
  };
}
