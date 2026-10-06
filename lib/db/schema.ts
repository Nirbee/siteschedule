// Source of truth for the database structure (docs/schema.sql is a human-readable mirror).
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamptz = () => timestamp({ withTimezone: true });
const createdAt = () => timestamptz().notNull().defaultNow();
/** Telegram ids fit in 52 bits, so JS numbers are safe. */
const tgId = () => bigint({ mode: "number" });

// Enums ----------------------------------------------------------------------
export const userRole = pgEnum("user_role", ["student", "starosta", "admin"]);
export const lessonKind = pgEnum("lesson_kind", [
  "lecture",
  "seminar",
  "practice",
  "lab",
  "self_study",
]);
export const weekParity = pgEnum("week_parity", ["any", "numerator", "denominator"]);
export const changeType = pgEnum("change_type", ["cancel", "replace", "move", "add", "room"]);
export const mediaKind = pgEnum("media_kind", ["photo", "file"]);
export const mediaStatus = pgEnum("media_status", ["sorted", "unsorted"]);
export const mediaSource = pgEnum("media_source", ["upload", "tg_import", "tg_bot"]);
export const loginMethod = pgEnum("login_method", ["telegram", "qr", "admin_link"]);
export const loginStatus = pgEnum("login_status", ["pending", "confirmed", "consumed", "rejected"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sent", "failed"]);

// Groups ---------------------------------------------------------------------
export const groups = pgTable("groups", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  isEnabled: boolean().notNull().default(true),
  sort: integer().notNull().default(0),
});

// Users, sessions, login -----------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    telegramId: tgId().notNull().unique(),
    firstName: text().notNull(),
    lastName: text(),
    username: text(),
    photoUrl: text(),
    displayName: text().notNull(),
    role: userRole().notNull().default("student"),
    groupId: uuid().references(() => groups.id, { onDelete: "set null" }),
    hasAccess: boolean().notNull().default(false),
    isBlocked: boolean().notNull().default(false),
    icalToken: text().notNull().unique(),
    botStarted: boolean().notNull().default(false),
    notifyMorning: boolean().notNull().default(false),
    notifyReminders: boolean().notNull().default(false),
    theme: text().notNull().default("system"),
    createdAt: createdAt(),
    lastSeenAt: timestamptz(),
  },
  (t) => [check("users_theme_check", sql`${t.theme} in ('system', 'light', 'dark')`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(), // sha256 of the cookie token
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    lastUsedAt: timestamptz().notNull().defaultNow(),
    expiresAt: timestamptz().notNull(),
    userAgent: text(),
    revokedAt: timestamptz(),
  },
  (t) => [index().on(t.userId)],
);

export const loginRequests = pgTable("login_requests", {
  id: uuid().primaryKey().defaultRandom(),
  method: loginMethod().notNull(),
  codeHash: text().notNull().unique(),
  pollHash: text().unique(),
  status: loginStatus().notNull().default("pending"),
  userId: uuid().references(() => users.id, { onDelete: "cascade" }),
  approvedBy: uuid().references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamptz().notNull(),
  confirmedAt: timestamptz(),
  consumedAt: timestamptz(),
});

// Semester and bell grid -----------------------------------------------------
export const semesters = pgTable(
  "semesters",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    startsOn: date({ mode: "string" }).notNull(), // Monday of week 1
    endsOn: date({ mode: "string" }).notNull(),
    firstWeekParity: weekParity().notNull().default("numerator"),
    isCurrent: boolean().notNull().default(false),
  },
  (t) => [
    check("semesters_first_week_parity_check", sql`${t.firstWeekParity} <> 'any'`),
    uniqueIndex("semesters_single_current")
      .on(t.isCurrent)
      .where(sql`${t.isCurrent}`),
  ],
);

export const timeSlots = pgTable("time_slots", {
  n: smallint().primaryKey(),
  startsAt: time().notNull(),
  endsAt: time().notNull(),
});

// Subjects and base schedule -------------------------------------------------
export const subjects = pgTable("subjects", {
  id: uuid().primaryKey().defaultRandom(),
  semesterId: uuid()
    .notNull()
    .references(() => semesters.id, { onDelete: "cascade" }),
  name: text().notNull(),
  shortName: text(),
  aliases: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  teacher: text(),
});

export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    weekday: smallint().notNull(),
    slotN: smallint()
      .notNull()
      .references(() => timeSlots.n),
    parity: weekParity().notNull().default("any"),
    kind: lessonKind().notNull(),
    room: text(),
    teacher: text(),
    validFrom: date({ mode: "string" }),
    validTo: date({ mode: "string" }),
  },
  (t) => [check("schedule_entries_weekday_check", sql`${t.weekday} between 1 and 7`)],
);

export const scheduleEntryGroups = pgTable(
  "schedule_entry_groups",
  {
    entryId: uuid()
      .notNull()
      .references(() => scheduleEntries.id, { onDelete: "cascade" }),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.groupId] })],
);

// Date-specific changes on top of the base -----------------------------------
export const scheduleChanges = pgTable(
  "schedule_changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    type: changeType().notNull(),
    date: date({ mode: "string" }).notNull(),
    entryId: uuid().references(() => scheduleEntries.id, { onDelete: "set null" }),
    slotN: smallint().references(() => timeSlots.n),
    startsAt: time(),
    endsAt: time(),
    newSubjectId: uuid().references(() => subjects.id),
    newKind: lessonKind(),
    newRoom: text(),
    newTeacher: text(),
    newDate: date({ mode: "string" }),
    newSlotN: smallint().references(() => timeSlots.n),
    newStartsAt: time(),
    newEndsAt: time(),
    comment: text(),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    revokedAt: timestamptz(),
    revokedBy: uuid().references(() => users.id),
  },
  (t) => [
    index("schedule_changes_date_active")
      .on(t.date)
      .where(sql`${t.revokedAt} is null`),
    index("schedule_changes_new_date_active")
      .on(t.newDate)
      .where(sql`${t.revokedAt} is null`),
    check("schedule_changes_entry_check", sql`${t.type} = 'add' or ${t.entryId} is not null`),
    check(
      "schedule_changes_add_time_check",
      sql`${t.type} <> 'add' or ${t.slotN} is not null or (${t.startsAt} is not null and ${t.endsAt} is not null)`,
    ),
    check(
      "schedule_changes_move_target_check",
      sql`${t.type} <> 'move' or (${t.newDate} is not null and (${t.newSlotN} is not null or (${t.newStartsAt} is not null and ${t.newEndsAt} is not null)))`,
    ),
  ],
);

export const scheduleChangeGroups = pgTable(
  "schedule_change_groups",
  {
    changeId: uuid()
      .notNull()
      .references(() => scheduleChanges.id, { onDelete: "cascade" }),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.changeId, t.groupId] })],
);

// Control events --------------------------------------------------------------
export const controlEvents = pgTable("control_events", {
  id: uuid().primaryKey().defaultRandom(),
  subjectId: uuid()
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  date: date({ mode: "string" }).notNull(),
  slotN: smallint().references(() => timeSlots.n),
  startsAt: time(),
  endsAt: time(),
  form: text().notNull(),
  room: text(),
  admission: text(),
  createdBy: uuid().references(() => users.id),
  createdAt: createdAt(),
});

// Topics ----------------------------------------------------------------------
export const topicLists = pgTable(
  "topic_lists",
  {
    id: uuid().primaryKey().defaultRandom(),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    pickDeadline: timestamptz(),
    defaultCapacity: integer().notNull().default(1),
    rules: text(),
    createdBy: uuid().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [check("topic_lists_default_capacity_check", sql`${t.defaultCapacity} >= 1`)],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid().primaryKey().defaultRandom(),
    listId: uuid()
      .notNull()
      .references(() => topicLists.id, { onDelete: "cascade" }),
    n: integer().notNull(),
    title: text().notNull(),
    capacity: integer().notNull().default(1),
    dueDate: date({ mode: "string" }),
    dueOrder: integer(),
    isDone: boolean().notNull().default(false),
  },
  (t) => [
    unique().on(t.listId, t.n),
    unique("topics_id_list_id_unique").on(t.id, t.listId),
    check("topics_capacity_check", sql`${t.capacity} >= 1`),
  ],
);

export const topicMembers = pgTable(
  "topic_members",
  {
    topicId: uuid().notNull(),
    listId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.userId] }),
    unique("topic_members_one_per_list").on(t.listId, t.userId),
    foreignKey({
      columns: [t.topicId, t.listId],
      foreignColumns: [topics.id, topics.listId],
    }).onDelete("cascade"),
  ],
);

// Notes and materials ---------------------------------------------------------
export const lessonNotes = pgTable(
  "lesson_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    slotN: smallint().references(() => timeSlots.n),
    startsAt: time(),
    kind: lessonKind(),
    title: text(),
  },
  (t) => [
    unique("lesson_notes_lesson_unique")
      .on(t.subjectId, t.date, t.slotN, t.startsAt)
      .nullsNotDistinct(),
  ],
);

export const media = pgTable(
  "media",
  {
    id: uuid().primaryKey().defaultRandom(),
    status: mediaStatus().notNull(),
    subjectId: uuid().references(() => subjects.id, { onDelete: "set null" }),
    lessonNoteId: uuid().references(() => lessonNotes.id, { onDelete: "set null" }),
    kind: mediaKind().notNull(),
    storageKey: text().notNull(),
    previewKey: text(),
    fileName: text().notNull(),
    title: text(), // display name for files («Unknown 7.pdf» → «Задачи к семинару 3»)
    pageCount: integer(), // PDF only
    // PDF copy for in-site viewing of Office/DjVu files (created in the background).
    viewKey: text(),
    viewStatus: text().notNull().default("none"),
    mime: text().notNull(),
    sizeBytes: integer().notNull(),
    width: integer(),
    height: integer(),
    sha256: text().notNull(),
    sort: integer().notNull().default(0),
    caption: text(),
    source: mediaSource().notNull(),
    uploaderId: uuid().references(() => users.id, { onDelete: "set null" }),
    tgAuthorId: tgId(),
    tgAuthorName: text(),
    tgChatId: tgId(),
    tgMessageId: tgId(),
    tgThreadId: tgId(),
    tgMediaGroupId: text(),
    postedAt: timestamptz().notNull(),
    suggestedSubjectId: uuid().references(() => subjects.id, { onDelete: "set null" }),
    suggestedLessonDate: date({ mode: "string" }),
    suggestedSlotN: smallint(),
    suggestionReason: text(),
    sortedBy: uuid().references(() => users.id),
    sortedAt: timestamptz(),
    createdAt: createdAt(),
    deletedAt: timestamptz(),
  },
  (t) => [
    index("media_lesson_note_sort")
      .on(t.lessonNoteId, t.sort)
      .where(sql`${t.deletedAt} is null`),
    index("media_subject_materials")
      .on(t.subjectId)
      .where(sql`${t.deletedAt} is null and ${t.lessonNoteId} is null`),
    index("media_unsorted")
      .on(t.status)
      .where(sql`${t.status} = 'unsorted' and ${t.deletedAt} is null`),
    uniqueIndex("media_sha256_unique")
      .on(t.sha256)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("media_tg_message_unique")
      .on(t.tgChatId, t.tgMessageId)
      .where(sql`${t.tgMessageId} is not null`),
    check(
      "media_view_status_check",
      sql`${t.viewStatus} in ('none', 'pending', 'ready', 'failed')`,
    ),
    index("media_view_pending")
      .on(t.createdAt)
      .where(sql`${t.viewStatus} = 'pending' and ${t.deletedAt} is null`),
    check("media_sorted_has_subject", sql`${t.status} = 'unsorted' or ${t.subjectId} is not null`),
    check("media_lesson_has_subject", sql`${t.lessonNoteId} is null or ${t.subjectId} is not null`),
  ],
);

// News ------------------------------------------------------------------------
export const news = pgTable("news", {
  id: uuid().primaryKey().defaultRandom(),
  authorId: uuid()
    .notNull()
    .references(() => users.id),
  body: text().notNull(),
  isPinned: boolean().notNull().default(false),
  sendToTg: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamptz(),
});

// Outbox for the bot ----------------------------------------------------------
export const outbox = pgTable(
  "outbox",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    dedupeKey: text().notNull().unique(),
    kind: text().notNull(),
    chatId: tgId().notNull(),
    threadId: tgId(),
    payload: jsonb().notNull(),
    status: outboxStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamptz().notNull().defaultNow(),
    lockedUntil: timestamptz(),
    sentAt: timestamptz(),
    tgMessageId: tgId(),
    lastError: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("outbox_pending")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// Audit log -------------------------------------------------------------------
export const auditLog = pgTable("audit_log", {
  id: bigserial({ mode: "number" }).primaryKey(),
  actorId: uuid().references(() => users.id),
  action: text().notNull(),
  entity: text().notNull(),
  entityId: text(),
  payload: jsonb(),
  createdAt: createdAt(),
});
