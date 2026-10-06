// Teachers: photo, full name, the university e-mail for students, which subjects they teach.
import sharp from "sharp";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { auditLog, semesters, subjects, teacherSubjects, teachers } from "@/lib/db/schema";
import { deleteObject, newKey, writeObject } from "@/lib/storage/disk";
import type { User } from "./users";

type Actor = Pick<User, "id" | "role">;
const isStaff = (actor: Actor) => actor.role === "starosta" || actor.role === "admin";
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const teacherInput = z.object({
  fullName: z.string().trim().min(3, "Укажите ФИО").max(120),
  email: z.union([z.literal(""), z.email("Проверьте почту")]).transform((v) => v || null),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
  subjectIds: z.array(z.uuid()).max(20),
});
export type TeacherInput = z.input<typeof teacherInput>;

export interface TeacherView {
  id: string;
  fullName: string;
  email: string | null;
  note: string | null;
  hasPhoto: boolean;
  subjects: { id: string; name: string }[];
}

/** Teachers with their subjects of the current semester, alphabetically. */
export async function listTeachers(): Promise<TeacherView[]> {
  const [rows, links] = await Promise.all([
    db().select().from(teachers).orderBy(asc(teachers.sort), asc(teachers.fullName)),
    db()
      .select({ teacherId: teacherSubjects.teacherId, id: subjects.id, name: subjects.name })
      .from(teacherSubjects)
      .innerJoin(subjects, eq(subjects.id, teacherSubjects.subjectId))
      .innerJoin(semesters, eq(semesters.id, subjects.semesterId))
      .where(eq(semesters.isCurrent, true))
      .orderBy(asc(subjects.name)),
  ]);
  return rows.map((t) => ({
    id: t.id,
    fullName: t.fullName,
    email: t.email,
    note: t.note,
    hasPhoto: Boolean(t.photoKey),
    subjects: links.filter((l) => l.teacherId === t.id).map(({ id, name }) => ({ id, name })),
  }));
}

export async function teacherPhotoKey(id: string): Promise<string | null> {
  const [row] = await db()
    .select({ key: teachers.photoKey })
    .from(teachers)
    .where(eq(teachers.id, id));
  return row?.key ?? null;
}

/** Square 400px webp without metadata (EXIF, location). */
async function storePhoto(bytes: Uint8Array): Promise<string> {
  const webp = await sharp(bytes)
    .rotate()
    .resize(400, 400, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  const key = `${newKey("teachers")}.webp`;
  await writeObject(key, webp);
  return key;
}

export async function saveTeacher(
  actor: Actor,
  id: string | null,
  raw: TeacherInput,
  photo: Uint8Array | null,
): Promise<Result<{ id: string }>> {
  if (!isStaff(actor)) return { ok: false, error: "Это могут только старосты" };
  const parsed = teacherInput.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { subjectIds, ...values } = parsed.data;

  let photoKey: string | undefined;
  if (photo) {
    try {
      photoKey = await storePhoto(photo);
    } catch {
      return { ok: false, error: "Не удалось прочитать фото" };
    }
  }

  let savedId = id;
  if (id) {
    const [old] = await db().select().from(teachers).where(eq(teachers.id, id));
    if (!old) return { ok: false, error: "Преподаватель не найден" };
    await db()
      .update(teachers)
      .set({ ...values, ...(photoKey ? { photoKey } : {}) })
      .where(eq(teachers.id, id));
    if (photoKey && old.photoKey) await deleteObject(old.photoKey);
  } else {
    const [created] = await db()
      .insert(teachers)
      .values({ ...values, photoKey: photoKey ?? null })
      .returning({ id: teachers.id });
    savedId = created!.id;
  }
  await db().delete(teacherSubjects).where(eq(teacherSubjects.teacherId, savedId!));
  if (subjectIds.length) {
    const valid = await db()
      .select({ id: subjects.id })
      .from(subjects)
      .where(inArray(subjects.id, subjectIds));
    if (valid.length)
      await db()
        .insert(teacherSubjects)
        .values(valid.map((s) => ({ teacherId: savedId!, subjectId: s.id })));
  }
  await db()
    .insert(auditLog)
    .values({
      actorId: actor.id,
      action: id ? "teacher.update" : "teacher.create",
      entity: "teacher",
      entityId: savedId!,
      payload: { fullName: values.fullName },
    });
  return { ok: true, id: savedId! };
}

export async function deleteTeacher(actor: Actor, id: string): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Это могут только старосты" };
  const [deleted] = await db().delete(teachers).where(eq(teachers.id, id)).returning();
  if (!deleted) return { ok: false, error: "Преподаватель не найден" };
  if (deleted.photoKey) await deleteObject(deleted.photoKey);
  await db()
    .insert(auditLog)
    .values({
      actorId: actor.id,
      action: "teacher.delete",
      entity: "teacher",
      entityId: id,
      payload: { fullName: deleted.fullName },
    });
  return { ok: true };
}

/** The teacher of a subject (first one), for «отправить преподавателю». */
export async function teacherOfSubject(subjectId: string, teacherId?: string | null) {
  const where = teacherId
    ? eq(teachers.id, teacherId)
    : and(eq(teacherSubjects.subjectId, subjectId));
  const [row] = await db()
    .select({ id: teachers.id, fullName: teachers.fullName, email: teachers.email })
    .from(teachers)
    .leftJoin(teacherSubjects, eq(teacherSubjects.teacherId, teachers.id))
    .where(where)
    .limit(1);
  return row ?? null;
}
