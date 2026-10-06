// Homework and control events (рубежки) with materials for preparation.
// Reading: everyone with access. Writing: starosta/admin; «сделано» marks: each student their own.
import { and, asc, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db/client";
import {
  assignmentDone,
  assignments,
  auditLog,
  controlEvents,
  lessonNotes,
  media,
  subjects,
  taskMaterials,
} from "@/lib/db/schema";
import { addDays, shortTime, type IsoDate } from "@/lib/schedule/dates";
import type { ScheduleData } from "@/lib/schedule/types";
import {
  assignmentInput,
  controlEventInput,
  type AssignmentInput,
  type ControlEventInput,
  type MaterialInput,
} from "@/lib/tasks/inputs";
import { placeDue, type DuePlace } from "@/lib/tasks/place";
import { getCurrentSemester } from "./schedule";
import type { User } from "./users";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Actor = Pick<User, "id" | "role">;
const isStaff = (actor: Actor) => actor.role === "starosta" || actor.role === "admin";
const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Проверьте поля формы";
const time = (t: string | null) => (t ? shortTime(t) : null);

export type MaterialView =
  | {
      id: string;
      kind: "media";
      mediaId: string;
      mediaKind: "photo" | "file";
      title: string | null;
      fileName: string;
      page: number | null;
    }
  | {
      id: string;
      kind: "note";
      noteId: string;
      subjectId: string;
      date: IsoDate;
      noteTitle: string | null;
    }
  | { id: string; kind: "link"; url: string; title: string | null };

export interface AssignmentView {
  id: string;
  subjectId: string;
  subjectName: string;
  due: DuePlace;
  body: string;
  done: boolean;
  materials: MaterialView[];
}

export interface ControlEventView {
  id: string;
  subjectId: string;
  subjectName: string;
  date: IsoDate;
  slotN: number | null;
  startsAt: string | null;
  endsAt: string | null;
  form: string;
  room: string | null;
  topics: string | null;
  rules: string | null;
  admission: string | null;
  materials: MaterialView[];
}

// Materials -----------------------------------------------------------------------

async function loadMaterials(
  owner: "assignment" | "control",
  ids: string[],
): Promise<Map<string, MaterialView[]>> {
  const result = new Map<string, MaterialView[]>();
  if (ids.length === 0) return result;
  const ownerColumn =
    owner === "assignment" ? taskMaterials.assignmentId : taskMaterials.controlEventId;
  const rows = await db()
    .select({
      link: taskMaterials,
      media: {
        id: media.id,
        kind: media.kind,
        title: media.title,
        fileName: media.fileName,
        deletedAt: media.deletedAt,
      },
      note: {
        id: lessonNotes.id,
        subjectId: lessonNotes.subjectId,
        date: lessonNotes.date,
        title: lessonNotes.title,
      },
    })
    .from(taskMaterials)
    .leftJoin(media, eq(media.id, taskMaterials.mediaId))
    .leftJoin(lessonNotes, eq(lessonNotes.id, taskMaterials.lessonNoteId))
    .where(inArray(ownerColumn, ids))
    .orderBy(asc(taskMaterials.sort));

  for (const { link, media: file, note } of rows) {
    const ownerId = (owner === "assignment" ? link.assignmentId : link.controlEventId)!;
    let view: MaterialView | null = null;
    if (link.mediaId && file && !file.deletedAt) {
      view = {
        id: link.id,
        kind: "media",
        mediaId: file.id,
        mediaKind: file.kind,
        title: file.title,
        fileName: file.fileName,
        page: link.page,
      };
    } else if (link.lessonNoteId && note) {
      view = {
        id: link.id,
        kind: "note",
        noteId: note.id,
        subjectId: note.subjectId,
        date: note.date,
        noteTitle: note.title,
      };
    } else if (link.url) {
      view = { id: link.id, kind: "link", url: link.url, title: link.title };
    }
    if (view) result.set(ownerId, [...(result.get(ownerId) ?? []), view]);
  }
  return result;
}

/** Back to form values (for editing). */
export function materialToInput(m: MaterialView): MaterialInput {
  if (m.kind === "media") return { mediaId: m.mediaId, page: m.page };
  if (m.kind === "note") return { lessonNoteId: m.noteId };
  return { url: m.url, title: m.title };
}

async function checkMaterials(list: z.output<typeof assignmentInput>["materials"]) {
  const mediaIds = list.flatMap((m) => ("mediaId" in m ? [m.mediaId] : []));
  const noteIds = list.flatMap((m) => ("lessonNoteId" in m ? [m.lessonNoteId] : []));
  if (mediaIds.length) {
    const [{ n } = { n: 0 }] = await db()
      .select({ n: count() })
      .from(media)
      .where(and(inArray(media.id, mediaIds), isNull(media.deletedAt)));
    if (n !== new Set(mediaIds).size) return "Один из файлов удалён — обновите страницу";
  }
  if (noteIds.length) {
    const [{ n } = { n: 0 }] = await db()
      .select({ n: count() })
      .from(lessonNotes)
      .where(inArray(lessonNotes.id, noteIds));
    if (n !== new Set(noteIds).size) return "Одно из занятий не найдено — обновите страницу";
  }
  return null;
}

async function replaceMaterials(
  owner: { assignmentId: string } | { controlEventId: string },
  list: z.output<typeof assignmentInput>["materials"],
) {
  await db()
    .delete(taskMaterials)
    .where(
      "assignmentId" in owner
        ? eq(taskMaterials.assignmentId, owner.assignmentId)
        : eq(taskMaterials.controlEventId, owner.controlEventId),
    );
  if (list.length === 0) return;
  await db()
    .insert(taskMaterials)
    .values(
      list.map((m, sort) => ({
        ...owner,
        sort,
        ...("mediaId" in m
          ? { mediaId: m.mediaId, page: m.page ?? null }
          : "lessonNoteId" in m
            ? { lessonNoteId: m.lessonNoteId }
            : { url: m.url, title: m.title }),
      })),
    );
}

export interface MaterialOption {
  value: string; // "m:<mediaId>" | "n:<lessonNoteId>"
  kind: "file" | "note";
  title: string | null;
  fileName: string | null;
  pageCount: number | null;
  date: IsoDate | null;
}

/** Library files and lessons with notes, per subject — for the material picker. */
export async function materialOptions(): Promise<Record<string, MaterialOption[]>> {
  const semester = await getCurrentSemester();
  if (!semester) return {};
  const [files, notes] = await Promise.all([
    db()
      .select({
        id: media.id,
        subjectId: media.subjectId,
        title: media.title,
        fileName: media.fileName,
        pageCount: media.pageCount,
      })
      .from(media)
      .innerJoin(subjects, eq(subjects.id, media.subjectId))
      .where(
        and(
          eq(subjects.semesterId, semester.id),
          eq(media.kind, "file"),
          eq(media.status, "sorted"),
          isNull(media.deletedAt),
        ),
      )
      .orderBy(asc(media.fileName)),
    db()
      .selectDistinct({
        id: lessonNotes.id,
        subjectId: lessonNotes.subjectId,
        date: lessonNotes.date,
        title: lessonNotes.title,
      })
      .from(lessonNotes)
      .innerJoin(media, and(eq(media.lessonNoteId, lessonNotes.id), isNull(media.deletedAt)))
      .orderBy(asc(lessonNotes.date)),
  ]);
  const result: Record<string, MaterialOption[]> = {};
  const push = (subjectId: string, option: MaterialOption) =>
    (result[subjectId] ??= []).push(option);
  for (const f of files)
    push(f.subjectId!, {
      value: `m:${f.id}`,
      kind: "file",
      title: f.title,
      fileName: f.fileName,
      pageCount: f.pageCount,
      date: null,
    });
  for (const n of notes)
    push(n.subjectId, {
      value: `n:${n.id}`,
      kind: "note",
      title: n.title,
      fileName: null,
      pageCount: null,
      date: n.date,
    });
  return result;
}

// Homework ------------------------------------------------------------------------

/** Homework due in [from, to] (inclusive), with the user's «сделано» marks. */
export async function listAssignments(
  userId: string,
  { from, to }: { from?: IsoDate; to?: IsoDate } = {},
): Promise<AssignmentView[]> {
  const rows = await db()
    .select({
      a: assignments,
      subjectName: subjects.name,
      done: sql<boolean>`${assignmentDone.userId} is not null`,
    })
    .from(assignments)
    .innerJoin(subjects, eq(subjects.id, assignments.subjectId))
    .leftJoin(
      assignmentDone,
      and(eq(assignmentDone.assignmentId, assignments.id), eq(assignmentDone.userId, userId)),
    )
    .where(
      and(
        from ? gte(assignments.dueDate, from) : undefined,
        to ? lte(assignments.dueDate, to) : undefined,
      ),
    )
    .orderBy(asc(assignments.dueDate), asc(assignments.dueSlotN), asc(assignments.createdAt));
  const materials = await loadMaterials(
    "assignment",
    rows.map((r) => r.a.id),
  );
  return rows.map(({ a, subjectName, done }) => ({
    id: a.id,
    subjectId: a.subjectId,
    subjectName,
    due: { date: a.dueDate, slotN: a.dueSlotN, startsAt: time(a.dueStartsAt) },
    body: a.body,
    done: Boolean(done),
    materials: materials.get(a.id) ?? [],
  }));
}

export async function getAssignment(id: string) {
  const [row] = await db().select().from(assignments).where(eq(assignments.id, id));
  if (!row) return undefined;
  const materials = await loadMaterials("assignment", [id]);
  return {
    id: row.id,
    subjectId: row.subjectId,
    due: { date: row.dueDate, slotN: row.dueSlotN, startsAt: time(row.dueStartsAt) },
    body: row.body,
    materials: materials.get(id) ?? [],
  };
}

async function subjectInCurrentSemester(subjectId: string): Promise<boolean> {
  const semester = await getCurrentSemester();
  if (!semester) return false;
  const [row] = await db()
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.semesterId, semester.id)));
  return Boolean(row);
}

export async function saveAssignment(
  actor: Actor,
  id: string | null,
  raw: AssignmentInput,
): Promise<Result<{ id: string }>> {
  if (!isStaff(actor)) return { ok: false, error: "Задания добавляют старосты" };
  const parsed = assignmentInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  if (!(await subjectInCurrentSemester(input.subjectId)))
    return { ok: false, error: "Дисциплина не найдена" };
  const problem = await checkMaterials(input.materials);
  if (problem) return { ok: false, error: problem };

  const values = {
    subjectId: input.subjectId,
    dueDate: input.due.date,
    dueSlotN: input.due.slotN,
    dueStartsAt: input.due.startsAt,
    body: input.body,
  };
  let savedId = id;
  if (id) {
    const updated = await db()
      .update(assignments)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(assignments.id, id))
      .returning({ id: assignments.id });
    if (updated.length === 0) return { ok: false, error: "Задание не найдено" };
  } else {
    const [created] = await db()
      .insert(assignments)
      .values({ ...values, createdBy: actor.id })
      .returning({ id: assignments.id });
    savedId = created!.id;
  }
  await replaceMaterials({ assignmentId: savedId! }, input.materials);
  await audit(actor, id ? "assignment.update" : "assignment.create", savedId!, values);
  return { ok: true, id: savedId! };
}

export async function deleteAssignment(actor: Actor, id: string): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Удалять задания могут старосты" };
  const [deleted] = await db()
    .delete(assignments)
    .where(eq(assignments.id, id))
    .returning({ body: assignments.body });
  if (!deleted) return { ok: false, error: "Задание не найдено" };
  await audit(actor, "assignment.delete", id, { body: deleted.body });
  return { ok: true };
}

/** A student's own «сделано» mark. */
export async function setAssignmentDone(
  userId: string,
  assignmentId: string,
  done: boolean,
): Promise<void> {
  if (done) {
    await db().insert(assignmentDone).values({ assignmentId, userId }).onConflictDoNothing();
  } else {
    await db()
      .delete(assignmentDone)
      .where(and(eq(assignmentDone.assignmentId, assignmentId), eq(assignmentDone.userId, userId)));
  }
}

// Control events ------------------------------------------------------------------

function toControlView(
  row: typeof controlEvents.$inferSelect,
  subjectName: string,
  materials: MaterialView[],
): ControlEventView {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectName,
    date: row.date,
    slotN: row.slotN,
    startsAt: time(row.startsAt),
    endsAt: time(row.endsAt),
    form: row.form,
    room: row.room,
    topics: row.topics,
    rules: row.rules,
    admission: row.admission,
    materials,
  };
}

export async function listControlEvents({
  from,
  to,
}: { from?: IsoDate; to?: IsoDate } = {}): Promise<ControlEventView[]> {
  const rows = await db()
    .select({ e: controlEvents, subjectName: subjects.name })
    .from(controlEvents)
    .innerJoin(subjects, eq(subjects.id, controlEvents.subjectId))
    .where(
      and(
        from ? gte(controlEvents.date, from) : undefined,
        to ? lte(controlEvents.date, to) : undefined,
      ),
    )
    .orderBy(asc(controlEvents.date), asc(controlEvents.slotN), asc(controlEvents.startsAt));
  const materials = await loadMaterials(
    "control",
    rows.map((r) => r.e.id),
  );
  return rows.map(({ e, subjectName }) => toControlView(e, subjectName, materials.get(e.id) ?? []));
}

export async function getControlEvent(id: string): Promise<ControlEventView | undefined> {
  const [row] = await db()
    .select({ e: controlEvents, subjectName: subjects.name })
    .from(controlEvents)
    .innerJoin(subjects, eq(subjects.id, controlEvents.subjectId))
    .where(eq(controlEvents.id, id));
  if (!row) return undefined;
  const materials = await loadMaterials("control", [id]);
  return toControlView(row.e, row.subjectName, materials.get(id) ?? []);
}

export async function saveControlEvent(
  actor: Actor,
  id: string | null,
  raw: ControlEventInput,
): Promise<Result<{ id: string }>> {
  if (!isStaff(actor)) return { ok: false, error: "Контрольные добавляют старосты" };
  const parsed = controlEventInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  if (!(await subjectInCurrentSemester(input.subjectId)))
    return { ok: false, error: "Дисциплина не найдена" };
  const problem = await checkMaterials(input.materials);
  if (problem) return { ok: false, error: problem };

  const values = {
    subjectId: input.subjectId,
    date: input.date,
    slotN: "slotN" in input.target ? input.target.slotN : null,
    startsAt: "startsAt" in input.target ? input.target.startsAt : null,
    endsAt: "endsAt" in input.target ? input.target.endsAt : null,
    form: input.form,
    room: input.room,
    topics: input.topics,
    rules: input.rules,
    admission: input.admission,
  };
  let savedId = id;
  if (id) {
    const updated = await db()
      .update(controlEvents)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(controlEvents.id, id))
      .returning({ id: controlEvents.id });
    if (updated.length === 0) return { ok: false, error: "Контрольная не найдена" };
  } else {
    const [created] = await db()
      .insert(controlEvents)
      .values({ ...values, createdBy: actor.id })
      .returning({ id: controlEvents.id });
    savedId = created!.id;
  }
  await replaceMaterials({ controlEventId: savedId! }, input.materials);
  await audit(actor, id ? "control_event.update" : "control_event.create", savedId!, values);
  return { ok: true, id: savedId! };
}

export async function deleteControlEvent(actor: Actor, id: string): Promise<Result> {
  if (!isStaff(actor)) return { ok: false, error: "Удалять контрольные могут старосты" };
  const [deleted] = await db()
    .delete(controlEvents)
    .where(eq(controlEvents.id, id))
    .returning({ date: controlEvents.date, form: controlEvents.form });
  if (!deleted) return { ok: false, error: "Контрольная не найдена" };
  await audit(actor, "control_event.delete", id, deleted);
  return { ok: true };
}

async function audit(actor: Actor, action: string, entityId: string, payload: unknown) {
  await db()
    .insert(auditLog)
    .values({ actorId: actor.id, action, entity: action.split(".")[0]!, entityId, payload });
}

// Feed for pages -------------------------------------------------------------------

export interface PlacedAssignment extends AssignmentView {
  /** The due point moved together with its lesson. */
  moved: boolean;
}

/**
 * Homework and control events whose (effective) date is in [from, to]. Homework due by a lesson
 * that was moved follows the lesson, so the window is widened a little to catch those.
 */
export async function tasksFeed(
  userId: string,
  groupId: string,
  data: ScheduleData | null,
  { from, to }: { from: IsoDate; to: IsoDate },
): Promise<{ assignments: PlacedAssignment[]; controls: ControlEventView[] }> {
  const [rows, controls] = await Promise.all([
    listAssignments(userId, { from: addDays(from, -21), to: addDays(to, 21) }),
    listControlEvents({ from, to }),
  ]);
  const assignments = rows
    .map((a) => {
      const { moved, ...due } = data
        ? placeDue(data, groupId, a.subjectId, a.due)
        : { ...a.due, moved: false };
      return { ...a, due, moved };
    })
    .filter((a) => a.due.date >= from && a.due.date <= to)
    .sort(
      (a, b) =>
        a.due.date.localeCompare(b.due.date) ||
        (a.due.slotN ?? 99) - (b.due.slotN ?? 99) ||
        (a.due.startsAt ?? "").localeCompare(b.due.startsAt ?? ""),
    );
  return { assignments, controls };
}
