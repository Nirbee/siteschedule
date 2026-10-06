// Topic lists (доклады, рефераты): picking topics, the class-code phase, staff tools, export.
// Picking is atomic: the topic row is locked while members are counted (docs/DATA_MODEL.md).
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, lte, max, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db/client";
import {
  auditLog,
  groups,
  semesters,
  subjects,
  topicClassAccess,
  topicLists,
  topicMembers,
  topics,
  users,
} from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import type { IsoDate } from "@/lib/schedule/dates";
import {
  fullNameInput,
  topicInput,
  topicListInput,
  type TopicInput,
  type TopicListInput,
} from "@/lib/topics/inputs";
import {
  canPick,
  classCode,
  CODE_STEP_MS,
  listPhase,
  shortGroup,
  topicStatus,
  verifyClassCode,
  type ListPhase,
  type TopicStatus,
} from "@/lib/topics/rules";
import type { ParsedTopic } from "@/lib/topics/parse";
import type { User } from "./users";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type Actor = Pick<User, "id" | "role">;
const isStaff = (actor: Actor) => actor.role === "starosta" || actor.role === "admin";
const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Проверьте поля формы";
const STAFF_ONLY = { ok: false as const, error: "Это могут только старосты" };

export interface TopicMemberView {
  userId: string;
  name: string;
  group: string | null;
}

export interface TopicView {
  id: string;
  n: number;
  title: string;
  details: string | null;
  capacity: number;
  dueDate: IsoDate | null;
  dueOrder: number | null;
  isDone: boolean;
  members: TopicMemberView[];
  status: TopicStatus;
}

export interface TopicListSummary {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  phase: ListPhase;
  pickDeadline: Date | null;
  opensAt: Date | null;
  defaultCapacity: number;
  total: number;
  /** Topics with no free places. */
  full: number;
  mine: { n: number; title: string; dueDate: IsoDate | null } | null;
}

export interface TopicListView extends TopicListSummary {
  rules: string | null;
  classOpenedAt: Date | null;
  topics: TopicView[];
  hasClassAccess: boolean;
  canPick: boolean;
}

const memberName = (u: { fullName: string | null; displayName: string }) =>
  u.fullName ?? u.displayName;

// Reading ---------------------------------------------------------------------------

async function loadTopics(listIds: string[], viewerId: string) {
  if (listIds.length === 0) return new Map<string, TopicView[]>();
  const [topicRows, memberRows] = await Promise.all([
    db().select().from(topics).where(inArray(topics.listId, listIds)).orderBy(asc(topics.n)),
    db()
      .select({
        topicId: topicMembers.topicId,
        userId: users.id,
        fullName: users.fullName,
        displayName: users.displayName,
        groupCode: groups.code,
      })
      .from(topicMembers)
      .innerJoin(users, eq(users.id, topicMembers.userId))
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(inArray(topicMembers.listId, listIds))
      .orderBy(asc(topicMembers.joinedAt)),
  ]);
  const result = new Map<string, TopicView[]>();
  for (const t of topicRows) {
    const members = memberRows
      .filter((m) => m.topicId === t.id)
      .map((m) => ({ userId: m.userId, name: memberName(m), group: shortGroup(m.groupCode) }));
    const view: TopicView = {
      id: t.id,
      n: t.n,
      title: t.title,
      details: t.details,
      capacity: t.capacity,
      dueDate: t.dueDate,
      dueOrder: t.dueOrder,
      isDone: t.isDone,
      members,
      status: topicStatus(
        t,
        members.length,
        members.some((m) => m.userId === viewerId),
      ),
    };
    result.set(t.listId, [...(result.get(t.listId) ?? []), view]);
  }
  return result;
}

function summarize(
  list: typeof topicLists.$inferSelect,
  subjectName: string,
  listTopics: TopicView[],
  viewerId: string,
  now: Date,
): TopicListSummary {
  const mine = listTopics.find((t) => t.members.some((m) => m.userId === viewerId));
  return {
    id: list.id,
    subjectId: list.subjectId,
    subjectName,
    title: list.title,
    phase: listPhase(list, now),
    pickDeadline: list.pickDeadline,
    opensAt: list.opensAt,
    defaultCapacity: list.defaultCapacity,
    total: listTopics.length,
    full: listTopics.filter((t) => t.members.length >= t.capacity).length,
    mine: mine ? { n: mine.n, title: mine.title, dueDate: mine.dueDate } : null,
  };
}

/** Lists of the current semester; drafts only for staff. */
export async function listTopicLists(
  actor: Actor,
  now: Date = new Date(),
): Promise<TopicListSummary[]> {
  const rows = await db()
    .select({ list: topicLists, subjectName: subjects.name })
    .from(topicLists)
    .innerJoin(subjects, eq(subjects.id, topicLists.subjectId))
    .innerJoin(semesters, eq(semesters.id, subjects.semesterId))
    .where(eq(semesters.isCurrent, true))
    .orderBy(desc(topicLists.createdAt));
  const byList = await loadTopics(
    rows.map((r) => r.list.id),
    actor.id,
  );
  return rows
    .map((r) => summarize(r.list, r.subjectName, byList.get(r.list.id) ?? [], actor.id, now))
    .filter((s) => isStaff(actor) || s.phase !== "draft");
}

export async function getTopicList(
  id: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<TopicListView | undefined> {
  const [row] = await db()
    .select({ list: topicLists, subjectName: subjects.name })
    .from(topicLists)
    .innerJoin(subjects, eq(subjects.id, topicLists.subjectId))
    .where(eq(topicLists.id, id));
  if (!row) return undefined;
  const listTopics = (await loadTopics([id], actor.id)).get(id) ?? [];
  const summary = summarize(row.list, row.subjectName, listTopics, actor.id, now);
  if (summary.phase === "draft" && !isStaff(actor)) return undefined;
  const [access] = await db()
    .select({ userId: topicClassAccess.userId })
    .from(topicClassAccess)
    .where(and(eq(topicClassAccess.listId, id), eq(topicClassAccess.userId, actor.id)));
  return {
    ...summary,
    rules: row.list.rules,
    classOpenedAt: row.list.classOpenedAt,
    topics: listTopics,
    hasClassAccess: Boolean(access),
    canPick: canPick(summary.phase, Boolean(access)),
  };
}

// Picking ---------------------------------------------------------------------------

export type PickResult = Result | { ok: false; error: string; needName: true };

/** Takes a topic (or joins a team). One topic per person per list; no overbooking. */
export async function takeTopic(
  actor: Actor & Pick<User, "fullName">,
  topicId: string,
  now: Date = new Date(),
): Promise<PickResult> {
  if (!actor.fullName) return { ok: false, error: "Сначала укажите фамилию и имя", needName: true };
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select({ topic: topics, list: topicLists })
      .from(topics)
      .innerJoin(topicLists, eq(topicLists.id, topics.listId))
      .where(eq(topics.id, topicId))
      .for("update", { of: topics });
    if (!row) return { ok: false as const, error: "Тема не найдена" };
    const phase = listPhase(row.list, now);
    if (!isStaff(actor)) {
      const [access] = await tx
        .select({ userId: topicClassAccess.userId })
        .from(topicClassAccess)
        .where(
          and(eq(topicClassAccess.listId, row.list.id), eq(topicClassAccess.userId, actor.id)),
        );
      if (!canPick(phase, Boolean(access)))
        return {
          ok: false as const,
          error:
            phase === "closed"
              ? "Выбор тем закрыт — обратитесь к старосте"
              : phase === "class"
                ? "Сейчас выбирают те, кто на паре — введите код с экрана старосты"
                : "Выбор тем ещё не открыт",
        };
    }
    if (row.topic.isDone) return { ok: false as const, error: "Эта тема уже сдана" };
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(topicMembers)
      .where(eq(topicMembers.topicId, topicId));
    if (n >= row.topic.capacity) return { ok: false as const, error: "Мест на эту тему уже нет" };
    const inserted = await tx
      .insert(topicMembers)
      .values({ topicId, listId: row.list.id, userId: actor.id })
      .onConflictDoNothing()
      .returning({ userId: topicMembers.userId });
    if (inserted.length === 0)
      return {
        ok: false as const,
        error: "У тебя уже есть тема в этом списке — сначала освободи её",
      };
    return { ok: true as const };
  });
}

/** Leaves a topic while picking is open (staff: any time). */
export async function leaveTopic(
  actor: Actor,
  topicId: string,
  now: Date = new Date(),
): Promise<Result> {
  const [row] = await db()
    .select({ topic: topics, list: topicLists })
    .from(topics)
    .innerJoin(topicLists, eq(topicLists.id, topics.listId))
    .where(eq(topics.id, topicId));
  if (!row) return { ok: false, error: "Тема не найдена" };
  if (!isStaff(actor)) {
    const phase = listPhase(row.list, now);
    if (row.topic.isDone) return { ok: false, error: "Тема уже сдана" };
    if (phase !== "open" && phase !== "class")
      return { ok: false, error: "Менять тему уже нельзя — обратитесь к старосте" };
  }
  await db()
    .delete(topicMembers)
    .where(and(eq(topicMembers.topicId, topicId), eq(topicMembers.userId, actor.id)));
  return { ok: true };
}

/** The code from the starosta's screen: lets this person pick before the list opens to all. */
export async function enterClassCode(
  actor: Actor,
  listId: string,
  code: string,
  now: Date = new Date(),
): Promise<Result> {
  if (!rateLimit(`topic-code:${actor.id}`, 10, 10 * 60_000, now.getTime()))
    return { ok: false, error: "Слишком много попыток, подождите несколько минут" };
  const [list] = await db().select().from(topicLists).where(eq(topicLists.id, listId));
  if (!list) return { ok: false, error: "Список не найден" };
  const phase = listPhase(list, now);
  if (phase === "open") return { ok: true }; // already open for everyone
  if (phase !== "class" || !list.classSecret) return { ok: false, error: "Сейчас код не нужен" };
  if (!verifyClassCode(list.classSecret, code, now.getTime()))
    return { ok: false, error: "Код не подошёл — он меняется каждые 30 секунд" };
  await db().insert(topicClassAccess).values({ listId, userId: actor.id }).onConflictDoNothing();
  return { ok: true };
}

export async function setOwnFullName(userId: string, raw: string): Promise<Result> {
  const parsed = fullNameInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await db().update(users).set({ fullName: parsed.data }).where(eq(users.id, userId));
  return { ok: true };
}

// Staff -----------------------------------------------------------------------------

async function audit(actor: Actor, action: string, entityId: string, payload?: unknown) {
  await db()
    .insert(auditLog)
    .values({
      actorId: actor.id,
      action,
      entity: "topic_list",
      entityId,
      payload: payload ?? null,
    });
}

async function insertTopics(listId: string, items: ParsedTopic[], defaultCapacity: number) {
  if (items.length === 0) return;
  const [{ last } = { last: 0 }] = await db()
    .select({ last: max(topics.n) })
    .from(topics)
    .where(eq(topics.listId, listId));
  await db()
    .insert(topics)
    .values(
      items.map((t, i) => ({
        listId,
        n: (last ?? 0) + i + 1,
        title: t.title,
        details: t.details,
        capacity: defaultCapacity,
      })),
    );
}

export async function createTopicList(
  actor: Actor,
  raw: TopicListInput,
  items: ParsedTopic[],
): Promise<Result<{ id: string }>> {
  if (!isStaff(actor)) return STAFF_ONLY;
  const parsed = topicListInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (items.length === 0) return { ok: false, error: "Добавьте хотя бы одну тему" };
  const [created] = await db()
    .insert(topicLists)
    .values({ ...parsed.data, createdBy: actor.id })
    .returning({ id: topicLists.id });
  await insertTopics(created!.id, items, parsed.data.defaultCapacity);
  await audit(actor, "topic_list.create", created!.id, { title: parsed.data.title });
  return { ok: true, id: created!.id };
}

export async function updateTopicList(
  actor: Actor,
  id: string,
  raw: TopicListInput,
): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  const parsed = topicListInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await db().update(topicLists).set(parsed.data).where(eq(topicLists.id, id));
  await audit(actor, "topic_list.update", id, parsed.data);
  return { ok: true };
}

export async function deleteTopicList(actor: Actor, id: string): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  const [deleted] = await db()
    .delete(topicLists)
    .where(eq(topicLists.id, id))
    .returning({ title: topicLists.title });
  if (!deleted) return { ok: false, error: "Список не найден" };
  await audit(actor, "topic_list.delete", id, deleted);
  return { ok: true };
}

export async function addTopics(
  actor: Actor,
  listId: string,
  items: ParsedTopic[],
): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  const [list] = await db().select().from(topicLists).where(eq(topicLists.id, listId));
  if (!list) return { ok: false, error: "Список не найден" };
  if (items.length === 0) return { ok: false, error: "Не нашлось ни одной темы" };
  await insertTopics(listId, items, list.defaultCapacity);
  return { ok: true };
}

export async function updateTopic(actor: Actor, topicId: string, raw: TopicInput): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  const parsed = topicInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const [{ n } = { n: 0 }] = await db()
    .select({ n: count() })
    .from(topicMembers)
    .where(eq(topicMembers.topicId, topicId));
  if (parsed.data.capacity < n)
    return { ok: false, error: `На теме уже ${n} чел. — сначала уберите лишних` };
  const updated = await db()
    .update(topics)
    .set(parsed.data)
    .where(eq(topics.id, topicId))
    .returning({ id: topics.id });
  return updated.length ? { ok: true } : { ok: false, error: "Тема не найдена" };
}

export async function setTopicDone(actor: Actor, topicId: string, done: boolean): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  await db().update(topics).set({ isDone: done }).where(eq(topics.id, topicId));
  return { ok: true };
}

export async function deleteTopic(actor: Actor, topicId: string): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  await db().delete(topics).where(eq(topics.id, topicId));
  return { ok: true };
}

/** Puts a person on a topic (moving them from another topic of the list if needed). */
export async function assignMember(actor: Actor, topicId: string, userId: string): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  return db().transaction(async (tx) => {
    const [topic] = await tx.select().from(topics).where(eq(topics.id, topicId)).for("update");
    if (!topic) return { ok: false as const, error: "Тема не найдена" };
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(topicMembers)
      .where(and(eq(topicMembers.topicId, topicId), ne(topicMembers.userId, userId)));
    if (n >= topic.capacity) return { ok: false as const, error: "Мест на эту тему нет" };
    await tx
      .delete(topicMembers)
      .where(and(eq(topicMembers.listId, topic.listId), eq(topicMembers.userId, userId)));
    await tx.insert(topicMembers).values({ topicId, listId: topic.listId, userId });
    return { ok: true as const };
  });
}

export async function removeMember(actor: Actor, topicId: string, userId: string): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  await db()
    .delete(topicMembers)
    .where(and(eq(topicMembers.topicId, topicId), eq(topicMembers.userId, userId)));
  return { ok: true };
}

/** «Открыть для присутствующих»: starts the class phase and its rotating code. */
export async function openForClass(actor: Actor, listId: string): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  await db()
    .update(topicLists)
    .set({
      classOpenedAt: sql`coalesce(${topicLists.classOpenedAt}, now())`,
      classSecret: sql`coalesce(${topicLists.classSecret}, ${randomBytes(24).toString("base64url")})`,
    })
    .where(eq(topicLists.id, listId));
  await audit(actor, "topic_list.open_class", listId);
  return { ok: true };
}

/** «Открыть для всех» now, at a scheduled time, or cancel the schedule (null). */
export async function setOpensAt(actor: Actor, listId: string, at: Date | null): Promise<Result> {
  if (!isStaff(actor)) return STAFF_ONLY;
  await db().update(topicLists).set({ opensAt: at }).where(eq(topicLists.id, listId));
  await audit(actor, "topic_list.opens_at", listId, { at });
  return { ok: true };
}

/** For the starosta's screen during the lesson. */
export async function classCodeState(
  actor: Actor,
  listId: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; code: string; msLeft: number; present: number; taken: number; open: boolean }
  | { ok: false; error: string }
> {
  if (!isStaff(actor)) return STAFF_ONLY;
  const [list] = await db().select().from(topicLists).where(eq(topicLists.id, listId));
  if (!list?.classSecret) return { ok: false, error: "Сначала откройте список для присутствующих" };
  const [[present], [taken]] = await Promise.all([
    db().select({ n: count() }).from(topicClassAccess).where(eq(topicClassAccess.listId, listId)),
    db().select({ n: count() }).from(topicMembers).where(eq(topicMembers.listId, listId)),
  ]);
  return {
    ok: true,
    code: classCode(list.classSecret, now.getTime()),
    msLeft: CODE_STEP_MS - (now.getTime() % CODE_STEP_MS),
    present: present?.n ?? 0,
    taken: taken?.n ?? 0,
    open: listPhase(list, now) === "open",
  };
}

/** People who can be put on a topic by hand. */
export async function assignableUsers() {
  const rows = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      displayName: users.displayName,
      groupCode: groups.code,
    })
    .from(users)
    .leftJoin(groups, eq(groups.id, users.groupId))
    .where(and(eq(users.hasAccess, true), eq(users.isBlocked, false)))
    .orderBy(asc(sql`coalesce(${users.fullName}, ${users.displayName})`));
  return rows.map((u) => ({ id: u.id, name: memberName(u), group: shortGroup(u.groupCode) }));
}

// Schedule views --------------------------------------------------------------------

export interface Presentation {
  subjectId: string;
  date: IsoDate;
  n: number;
  title: string;
  dueOrder: number | null;
  names: string[];
  mine: boolean;
  listId: string;
}

/** Topics presented in [from, to]: «Выступают» on lesson cards, own ones in «Скоро». */
export async function presentations(
  viewerId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<Presentation[]> {
  const rows = await db()
    .select({ topic: topics, subjectId: topicLists.subjectId })
    .from(topics)
    .innerJoin(topicLists, eq(topicLists.id, topics.listId))
    .where(and(gte(topics.dueDate, from), lte(topics.dueDate, to), eq(topics.isDone, false)))
    .orderBy(asc(topics.dueDate), asc(topics.dueOrder), asc(topics.n));
  if (rows.length === 0) return [];
  const members = await db()
    .select({
      topicId: topicMembers.topicId,
      userId: users.id,
      fullName: users.fullName,
      displayName: users.displayName,
    })
    .from(topicMembers)
    .innerJoin(users, eq(users.id, topicMembers.userId))
    .where(
      inArray(
        topicMembers.topicId,
        rows.map((r) => r.topic.id),
      ),
    );
  return rows
    .map(({ topic, subjectId }) => {
      const own = members.filter((m) => m.topicId === topic.id);
      return {
        subjectId,
        date: topic.dueDate!,
        n: topic.n,
        title: topic.title,
        dueOrder: topic.dueOrder,
        names: own.map(memberName),
        mine: own.some((m) => m.userId === viewerId),
        listId: topic.listId,
      };
    })
    .filter((p) => p.names.length > 0);
}

// Export ----------------------------------------------------------------------------

/** Rows like the starostas' Excel: №, тема, подтема, ФИО, группа (one row per person). */
export async function exportRows(listId: string, viewerId: string) {
  const listTopics = (await loadTopics([listId], viewerId)).get(listId) ?? [];
  return listTopics.flatMap((t) =>
    (t.members.length ? t.members : [null]).map((m) => ({
      n: t.n,
      title: t.title,
      details: t.details,
      name: m?.name ?? "",
      group: m?.group?.replace(/\D+$/, "") ?? "",
      dueDate: t.dueDate,
    })),
  );
}
