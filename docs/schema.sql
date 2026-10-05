-- Референсная схема PostgreSQL. В проекте реализуется через Drizzle (lib/db/schema.ts);
-- этот файл — источник истины по структуре и ограничениям.

create type user_role      as enum ('student', 'starosta', 'admin');
create type lesson_kind    as enum ('lecture', 'practice', 'seminar', 'lab');
create type week_parity    as enum ('any', 'odd', 'even');
create type change_type    as enum ('cancel', 'replace', 'move', 'add', 'room');
create type topic_status   as enum ('free', 'taken', 'done');
create type media_type     as enum ('photo', 'file');

-- Пользователи и доступ -------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  telegram_id   bigint unique not null,
  first_name    text not null,
  last_name     text,
  username      text,
  photo_url     text,
  display_name  text not null,               -- как показывать в списках: «Катя С.»
  role          user_role not null default 'student',
  is_member     boolean not null default false,  -- прошёл по инвайту
  ical_token    text unique not null default encode(gen_random_bytes(18), 'hex'),
  created_at    timestamptz not null default now()
);

create table invites (
  code        text primary key,               -- случайная строка 16+ символов
  role        user_role not null default 'student',
  max_uses    int not null default 40,
  used_count  int not null default 0,
  expires_at  timestamptz,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

-- Настройки семестра ----------------------------------------------------------
create table semesters (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,                 -- «Осень 2026»
  starts_on     date not null,                 -- понедельник 1-й недели (для чётности)
  ends_on       date not null,
  first_week_parity week_parity not null default 'odd',
  is_current    boolean not null default false
);

create table time_slots (                       -- сетка звонков
  n           smallint primary key,             -- номер пары
  starts_at   time not null,
  ends_at     time not null
);

-- Дисциплины и базовое расписание --------------------------------------------
create table subjects (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references semesters(id) on delete cascade,
  name        text not null,
  short_name  text,
  teacher     text
);

create table schedule_entries (                 -- повторяющиеся пары семестра
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- 1 = пн
  slot_n      smallint not null references time_slots(n),
  parity      week_parity not null default 'any',
  kind        lesson_kind not null,
  room        text,
  teacher     text,                             -- если отличается от subjects.teacher
  valid_from  date,                             -- null = с начала семестра
  valid_to    date                              -- null = до конца
);

-- Изменения на конкретные даты (поверх базы) ---------------------------------
create table schedule_changes (
  id              uuid primary key default gen_random_uuid(),
  type            change_type not null,
  date            date not null,                -- дата исходной пары (для add — дата новой)
  slot_n          smallint not null references time_slots(n),
  entry_id        uuid references schedule_entries(id) on delete set null, -- null для add
  -- поля нового состояния (по типу):
  new_subject_id  uuid references subjects(id),  -- replace, add
  new_kind        lesson_kind,                    -- replace, add
  new_room        text,                           -- replace, room, move, add
  new_teacher     text,
  new_date        date,                           -- move
  new_slot_n      smallint references time_slots(n), -- move
  comment         text,
  author_id       uuid not null references users(id),
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,                    -- «отменить ошибочное изменение»
  tg_message_id   bigint
);
create index on schedule_changes (date) where revoked_at is null;
create index on schedule_changes (new_date) where revoked_at is null;

-- Рубежный контроль -----------------------------------------------------------
create table control_events (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  date        date not null,
  slot_n      smallint references time_slots(n),
  form        text not null,                   -- «Письменная работа», «Тест»...
  room        text,
  admission   text,                            -- условия допуска
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

-- Темы ------------------------------------------------------------------------
create table topic_lists (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references subjects(id) on delete cascade,
  title          text not null,                -- «Доклады», «Рефераты»
  pick_deadline  timestamptz,
  rules          text,
  created_at     timestamptz not null default now()
);

create table topics (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references topic_lists(id) on delete cascade,
  n            int not null,
  title        text not null,
  assignee_id  uuid references users(id) on delete set null,
  due_date     date,
  status       topic_status not null default 'free',
  taken_at     timestamptz,
  unique (list_id, n),
  unique (list_id, assignee_id)                 -- одна тема на человека в списке
);

-- Конспекты -------------------------------------------------------------------
create table lesson_notes (                     -- «занятие» в библиотеке
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  date        date not null,
  slot_n      smallint references time_slots(n),
  kind        lesson_kind,
  title       text,                             -- тема занятия
  unique (subject_id, date, slot_n)
);

create table media (
  id              uuid primary key default gen_random_uuid(),
  lesson_note_id  uuid not null references lesson_notes(id) on delete cascade,
  uploader_id     uuid not null references users(id),
  type            media_type not null,
  storage_key     text not null,                -- оригинал / полноразмер
  preview_key     text,                         -- 480px webp, только фото
  file_name       text not null,
  mime            text not null,
  size_bytes      int not null,
  width           int,
  height          int,
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);
create index on media (lesson_note_id, sort);

-- Новости ---------------------------------------------------------------------
create table news (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references users(id),
  body           text not null,                 -- markdown, HTML запрещён
  is_pinned      boolean not null default false,
  sent_to_tg     boolean not null default false,
  tg_message_id  bigint,
  created_at     timestamptz not null default now()
);

-- Журнал действий старост (кто что поменял) ----------------------------------
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,                   -- 'schedule_change.create', ...
  entity      text not null,
  entity_id   text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
