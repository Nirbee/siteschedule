// Demo data for local development. The repository is public: no real people, schedules or ids here.
// Real data is loaded later through the admin UI or from files in data/private/ (git-ignored).
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../lib/db/schema";
import { addDays, mondayOf, todayInMoscow } from "../lib/schedule/dates";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo data in production.");
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env).");

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const token = () => randomBytes(18).toString("hex");

// Standard BMSTU bell grid.
const SLOTS = [
  [1, "08:30", "10:00"],
  [2, "10:10", "11:40"],
  [3, "11:50", "13:20"],
  [4, "14:05", "15:35"],
  [5, "15:55", "17:25"],
  [6, "17:35", "19:05"],
  [7, "19:15", "20:45"],
] as const;

type Kind = (typeof s.lessonKind.enumValues)[number];
type Parity = (typeof s.weekParity.enumValues)[number];

async function main() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      truncate table audit_log, outbox, news, task_materials, assignment_done, assignments, media,
        lesson_notes, topic_class_access, topic_members, topics, topic_lists,
        control_events, schedule_change_groups, schedule_changes, schedule_entry_groups,
        schedule_entries, subjects, time_slots, semesters, login_requests, sessions, users, groups
      restart identity cascade
    `);

    const [g11, g12] = await tx
      .insert(s.groups)
      .values([
        { code: "ИУ8-11М", sort: 1 },
        { code: "ИУ8-12М", sort: 2 },
      ])
      .returning();
    if (!g11 || !g12) throw new Error("groups not inserted");

    await tx
      .insert(s.timeSlots)
      .values(SLOTS.map(([n, startsAt, endsAt]) => ({ n, startsAt, endsAt })));

    const [semester] = await tx
      .insert(s.semesters)
      .values({
        title: "Осень 2026",
        startsOn: "2026-08-31",
        endsOn: "2026-12-27",
        firstWeekParity: "numerator",
        isCurrent: true,
      })
      .returning();
    if (!semester) throw new Error("semester not inserted");

    const subjectRows = await tx
      .insert(s.subjects)
      .values(
        [
          {
            name: "Криптографические протоколы",
            shortName: "КП",
            aliases: ["крипта", "криптография"],
            teacher: "Демо Преподаватель А.",
          },
          {
            name: "Аудит информационной безопасности",
            shortName: "Аудит ИБ",
            aliases: ["аудит"],
            teacher: "Демо Преподаватель Б.",
          },
          {
            name: "Правовое обеспечение ИБ",
            shortName: "ПО ИБ",
            aliases: ["право", "правовое"],
            teacher: null,
          },
          {
            name: "Управление информационной безопасностью",
            shortName: "УИБ",
            aliases: ["управление иб"],
            teacher: "Демо Преподаватель В.",
          },
          {
            name: "Иностранный язык",
            shortName: "Ин. яз",
            aliases: ["английский", "англ"],
            teacher: "Демо Преподаватель Г.",
          },
          { name: "Самостоятельная работа", shortName: null, aliases: [], teacher: null },
        ].map((subject) => ({ ...subject, semesterId: semester.id })),
      )
      .returning();
    const subject = (shortOrName: string) => {
      const found = subjectRows.find((r) => r.shortName === shortOrName || r.name === shortOrName);
      if (!found) throw new Error(`unknown subject ${shortOrName}`);
      return found.id;
    };

    // Demo week: shared by both groups, differs between numerator and denominator on Mon/Tue.
    const entries: {
      subject: string;
      weekday: number;
      slotN: number;
      parity: Parity;
      kind: Kind;
      room: string | null;
    }[] = [
      { subject: "КП", weekday: 1, slotN: 6, parity: "numerator", kind: "lecture", room: "412" },
      {
        subject: "ПО ИБ",
        weekday: 1,
        slotN: 6,
        parity: "denominator",
        kind: "lecture",
        room: "каф. ИУ8",
      },
      { subject: "КП", weekday: 1, slotN: 7, parity: "any", kind: "seminar", room: "412" },
      { subject: "УИБ", weekday: 2, slotN: 3, parity: "numerator", kind: "lecture", room: "305" },
      {
        subject: "Аудит ИБ",
        weekday: 2,
        slotN: 3,
        parity: "denominator",
        kind: "lecture",
        room: "305",
      },
      { subject: "Аудит ИБ", weekday: 2, slotN: 4, parity: "any", kind: "practice", room: "210" },
      { subject: "УИБ", weekday: 3, slotN: 5, parity: "any", kind: "seminar", room: "305" },
      { subject: "Ин. яз", weekday: 3, slotN: 7, parity: "any", kind: "seminar", room: "211" },
      { subject: "ПО ИБ", weekday: 4, slotN: 5, parity: "any", kind: "seminar", room: "каф. ИУ8" },
      {
        subject: "Самостоятельная работа",
        weekday: 5,
        slotN: 2,
        parity: "any",
        kind: "self_study",
        room: null,
      },
      {
        subject: "Самостоятельная работа",
        weekday: 6,
        slotN: 2,
        parity: "any",
        kind: "self_study",
        room: null,
      },
    ];
    const entryRows = await tx
      .insert(s.scheduleEntries)
      .values(entries.map(({ subject: name, ...rest }) => ({ ...rest, subjectId: subject(name) })))
      .returning({ id: s.scheduleEntries.id });
    await tx
      .insert(s.scheduleEntryGroups)
      .values(
        entryRows.flatMap(({ id }) => [g11, g12].map((g) => ({ entryId: id, groupId: g.id }))),
      );

    // Fake Telegram ids (real ids are much larger), used by the dev login in M1.
    const demoUsers: Omit<typeof s.users.$inferInsert, "hasAccess" | "icalToken">[] = [
      {
        telegramId: 1001,
        firstName: "Админ",
        displayName: "Админ Д.",
        role: "admin",
        groupId: g12.id,
      },
      {
        telegramId: 1002,
        firstName: "Староста",
        lastName: "Одиннадцатая",
        displayName: "Староста 11М",
        role: "starosta",
        groupId: g11.id,
      },
      {
        telegramId: 1003,
        firstName: "Староста",
        lastName: "Двенадцатая",
        displayName: "Староста 12М",
        role: "starosta",
        groupId: g12.id,
      },
      {
        telegramId: 1004,
        firstName: "Студент",
        lastName: "Первый",
        displayName: "Студент П.",
        role: "student",
        groupId: g11.id,
      },
      {
        telegramId: 1005,
        firstName: "Студентка",
        lastName: "Вторая",
        displayName: "Студентка В.",
        role: "student",
        groupId: g12.id,
      },
    ];
    const [admin] = await tx
      .insert(s.users)
      .values(demoUsers.map((user) => ({ ...user, hasAccess: true, icalToken: token() })))
      .returning();

    // Demo changes in the current week, so every status is visible on «Сегодня».
    const monday = mondayOf(todayInMoscow());
    const entryId = (i: number) => entryRows[i]!.id;
    const demoChanges: Omit<typeof s.scheduleChanges.$inferInsert, "authorId">[] = [
      {
        type: "cancel",
        date: addDays(monday, 1),
        entryId: entryId(5),
        comment: "Преподаватель на конференции, отработку назначат позже.",
      },
      {
        type: "replace",
        date: addDays(monday, 2),
        entryId: entryId(6),
        newSubjectId: subject("ПО ИБ"),
        newRoom: "210",
        comment: "Сегодня выступают первые трое по темам.",
      },
      {
        type: "move",
        date: addDays(monday, 3),
        entryId: entryId(8),
        newDate: addDays(monday, 5),
        newStartsAt: "10:00",
        newEndsAt: "11:30",
        comment: "Принести ноутбуки.",
      },
      {
        type: "add",
        date: addDays(monday, 4),
        slotN: 3,
        newSubjectId: subject("КП"),
        newKind: "lecture",
        newRoom: "412",
      },
    ];
    const changeRows = await tx
      .insert(s.scheduleChanges)
      .values(demoChanges.map((c) => ({ ...c, authorId: admin!.id })))
      .returning({ id: s.scheduleChanges.id });
    await tx
      .insert(s.scheduleChangeGroups)
      .values(
        changeRows.flatMap(({ id }) => [g11, g12].map((g) => ({ changeId: id, groupId: g.id }))),
      );

    // Demo homework (Monday seminar of КП) and a control event two weeks ahead.
    await tx.insert(s.assignments).values({
      subjectId: subject("КП"),
      dueDate: addDays(monday, 7),
      dueSlotN: 7,
      body: "Прочитать раздел о протоколах обмена ключами\nРешить задачи 1–3 из методички",
      createdBy: admin!.id,
    });
    await tx.insert(s.controlEvents).values({
      subjectId: subject("КП"),
      date: addDays(monday, 14),
      slotN: 7,
      form: "Контрольная работа",
      topics: "Протокол Диффи — Хеллмана\nЭлектронная подпись\nРасширенный алгоритм Евклида",
      rules: "Можно пользоваться своими записями\nТелефоны сдаём",
      createdBy: admin!.id,
    });

    // Demo topic list, open for everyone.
    const [demoList] = await tx
      .insert(s.topicLists)
      .values({
        subjectId: subject("ПО ИБ"),
        title: "Доклады",
        opensAt: new Date(Date.now() - 60_000),
        createdBy: admin!.id,
      })
      .returning();
    await tx.insert(s.topics).values(
      [
        ["Государственная тайна", null],
        ["Лицензирование в области ИБ", null],
        ["Персональные данные", "Общие аспекты обработки"],
        ["Персональные данные", "Биометрические данные"],
        ["Электронная подпись", null],
      ].map(([title, details], i) => ({ listId: demoList!.id, n: i + 1, title: title!, details })),
    );
  });

  const counts = await db.execute<{ table: string; n: number }>(sql`
    select 'groups' as table, count(*)::int as n from groups
    union all select 'subjects', count(*)::int from subjects
    union all select 'schedule_entries', count(*)::int from schedule_entries
    union all select 'users', count(*)::int from users
    union all select 'schedule_changes', count(*)::int from schedule_changes
    union all select 'assignments', count(*)::int from assignments
    union all select 'control_events', count(*)::int from control_events
  `);
  console.info("Seeded demo data:", Object.fromEntries(counts.map((r) => [r.table, r.n])));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
