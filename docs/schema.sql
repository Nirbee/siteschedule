-- Референсная схема PostgreSQL 17. В проекте реализуется через Drizzle (lib/db/schema.ts).
-- После M0 источник истины — lib/db/schema.ts и миграции; этот файл — справка
-- для чтения людьми, обновляется вместе со схемой.
-- Расширения не нужны: gen_random_uuid() есть в ядре. Случайные токены генерирует приложение.

create type user_role     as enum ('student', 'starosta', 'admin');
create type lesson_kind   as enum ('lecture', 'seminar', 'practice', 'lab', 'self_study');
create type week_parity   as enum ('any', 'numerator', 'denominator');   -- числитель / знаменатель
create type change_type   as enum ('cancel', 'replace', 'move', 'add', 'room');
create type media_kind    as enum ('photo', 'file');
create type media_status  as enum ('sorted', 'unsorted');
create type media_source  as enum ('upload', 'tg_import', 'tg_bot');
create type login_method  as enum ('telegram', 'qr', 'admin_link');
create type login_status  as enum ('pending', 'confirmed', 'consumed', 'rejected');
create type outbox_status as enum ('pending', 'sent', 'failed');

-- Группы ----------------------------------------------------------------------
create table groups (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,              -- «ИУ8-12М»
  is_enabled  boolean not null default true,     -- подключена к сайту
  sort        int not null default 0
);

-- Пользователи, сессии, вход -------------------------------------------------
create table users (
  id               uuid primary key default gen_random_uuid(),
  telegram_id      bigint unique not null,
  first_name       text not null,
  last_name        text,
  username         text,
  photo_url        text,
  display_name     text not null,               -- как показывать в списках: «Катя С.»
  full_name        text,                        -- «Фамилия Имя» для списков тем
  role             user_role not null default 'student',
  group_id         uuid references groups(id) on delete set null,  -- выбирает при первом входе
  has_access       boolean not null default false, -- участник чата или выдано админом
  is_blocked       boolean not null default false,
  ical_token       text unique not null,          -- случайный, генерирует приложение
  bot_started      boolean not null default false, -- бот может писать в личку
  notify_morning   boolean not null default false, -- сводка 07:30
  notify_reminders boolean not null default false, -- напоминания за день (тема, рубежка)
  theme            text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz
);

create table sessions (
  id            text primary key,                -- sha256(токена из cookie), сам токен не храним
  user_id       uuid not null references users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null,            -- скользящее: +400 дней при использовании
  user_agent    text,
  revoked_at    timestamptz
);
create index on sessions (user_id);

-- Заявка на вход: через бота, по QR с другого устройства или по ссылке от админа.
create table login_requests (
  id            uuid primary key default gen_random_uuid(),
  method        login_method not null,
  code_hash     text unique not null,            -- код из t.me-ссылки / QR / ссылки админа
  poll_hash     text unique,                     -- секрет браузера, который ждёт вход (cookie)
  status        login_status not null default 'pending',
  user_id       uuid references users(id) on delete cascade, -- известен после подтверждения
  approved_by   uuid references users(id),       -- кто подтвердил QR / создал ссылку
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,            -- telegram/qr: 15 мин; admin_link: до 7 дней
  confirmed_at  timestamptz,
  consumed_at   timestamptz
);

-- Семестр и сетка звонков -----------------------------------------------------
create table semesters (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,               -- «Осень 2026»
  starts_on         date not null,               -- понедельник 1-й недели (для чётности)
  ends_on           date not null,
  first_week_parity week_parity not null default 'numerator'
                    check (first_week_parity <> 'any'),
  is_current        boolean not null default false
);
create unique index on semesters (is_current) where is_current;

create table time_slots (                         -- сетка звонков
  n          smallint primary key,                -- номер пары
  starts_at  time not null,
  ends_at    time not null
);

-- Дисциплины и базовое расписание --------------------------------------------
create table subjects (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references semesters(id) on delete cascade,
  name        text not null,
  short_name  text,                               -- «ТСиСА»
  aliases     text[] not null default '{}',       -- для автосортировки: «тсиса», «системный анализ»
  teacher     text
);

create table schedule_entries (                   -- повторяющиеся пары семестра
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- 1 = пн
  slot_n      smallint not null references time_slots(n),
  parity      week_parity not null default 'any',
  kind        lesson_kind not null,
  room        text,
  teacher     text,                               -- если отличается от subjects.teacher
  valid_from  date,                               -- null = с начала семестра
  valid_to    date                                -- null = до конца
);

create table schedule_entry_groups (               -- для каких групп пара (общая — несколько строк)
  entry_id  uuid not null references schedule_entries(id) on delete cascade,
  group_id  uuid not null references groups(id) on delete cascade,
  primary key (entry_id, group_id)
);

-- Изменения на конкретные даты (поверх базы) ---------------------------------
-- Исходная пара: entry_id + date (для cancel/replace/room/move). Для add entry_id = null.
-- Время: номер пары по сетке ИЛИ произвольные начало/конец («другое время»).
-- Изменить уже перенесённую/добавленную пару = отозвать изменение и создать новое.
create table schedule_changes (
  id              uuid primary key default gen_random_uuid(),
  type            change_type not null,
  date            date not null,                -- дата исходной пары (для add — дата новой)
  entry_id        uuid references schedule_entries(id) on delete set null,
  slot_n          smallint references time_slots(n),  -- add: слот новой пары
  starts_at       time,                         -- add: «другое время»
  ends_at         time,
  -- новое состояние (по типу):
  new_subject_id  uuid references subjects(id), -- replace, add
  new_kind        lesson_kind,                  -- replace, add
  new_room        text,                         -- replace, room, move, add
  new_teacher     text,                         -- replace, add
  new_date        date,                         -- move
  new_slot_n      smallint references time_slots(n), -- move (по сетке)
  new_starts_at   time,                         -- move («другое время»)
  new_ends_at     time,
  comment         text,
  author_id       uuid not null references users(id),
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by      uuid references users(id),
  check (type = 'add' or entry_id is not null),
  check (type <> 'add' or slot_n is not null or (starts_at is not null and ends_at is not null)),
  check (type <> 'move' or (new_date is not null and
         (new_slot_n is not null or (new_starts_at is not null and new_ends_at is not null))))
);
create index on schedule_changes (date) where revoked_at is null;
create index on schedule_changes (new_date) where revoked_at is null;

create table schedule_change_groups (             -- кого касается (по умолчанию — группы пары)
  change_id uuid not null references schedule_changes(id) on delete cascade,
  group_id  uuid not null references groups(id) on delete cascade,
  primary key (change_id, group_id)
);

-- Рубежный контроль (видят группы, у которых есть этот предмет) -------------
create table control_events (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  date        date not null,
  slot_n      smallint references time_slots(n),
  starts_at   time,                               -- если не по сетке
  ends_at     time,
  form        text not null,                      -- «Контрольная работа», «Тест»...
  room        text,
  topics      text,                               -- «что будет», пункт на строку
  rules       text,                               -- «можно / нельзя»
  admission   text,                               -- условия допуска
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Домашнее задание: к паре (слот или время «не по сетке») или просто к дате ----
create table assignments (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references subjects(id) on delete cascade,
  due_date       date not null,
  due_slot_n     smallint references time_slots(n),
  due_starts_at  time,                            -- пара не по сетке
  body           text not null,                   -- пункт на строку
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  check (due_slot_n is null or due_starts_at is null)
);
create index assignments_due on assignments (due_date);

-- Личные отметки «сделано» (видит только сам студент)
create table assignment_done (
  assignment_id  uuid not null references assignments(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  done_at        timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

-- Темы ------------------------------------------------------------------------
create table topic_lists (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references subjects(id) on delete cascade,
  title            text not null,                -- «Доклады», «Рефераты»
  pick_deadline    timestamptz,                  -- null = без дедлайна
  default_capacity int not null default 1 check (default_capacity >= 1),
  rules            text,
  class_opened_at  timestamptz,                  -- «для присутствующих» (код с экрана старосты)
  class_secret     text,                         -- ключ HMAC для кода (меняется каждые 30 с)
  opens_at         timestamptz,                  -- «для всех»; может быть запланировано
  announced_at     timestamptz,                  -- объявление в чат отправлено (M6)
  created_by       uuid references users(id),
  created_at       timestamptz not null default now()
);

create table topics (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references topic_lists(id) on delete cascade,
  n          int not null,
  title      text not null,
  details    text,                                -- подтема
  capacity   int not null default 1 check (capacity >= 1),  -- 1, 2 или команда
  due_date   date,
  due_order  int,                                 -- порядок выступления внутри даты
  is_done    boolean not null default false,
  unique (list_id, n),
  unique (id, list_id)                            -- для составного FK из topic_members
);

create table topic_members (
  topic_id   uuid not null,
  list_id    uuid not null,                       -- денормализация ради уникальности ниже
  user_id    uuid not null references users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (topic_id, user_id),
  unique (list_id, user_id),                      -- одна тема на человека в списке
  foreign key (topic_id, list_id) references topics(id, list_id) on delete cascade
);

-- Кто ввёл код с экрана старосты на паре: выбирают до открытия «для всех»
create table topic_class_access (
  list_id     uuid not null references topic_lists(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  primary key (list_id, user_id)
);

-- Конспекты и материалы -------------------------------------------------------
create table lesson_notes (                       -- «занятие» в библиотеке
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  date        date not null,
  slot_n      smallint references time_slots(n), -- null, если пара была не по сетке
  starts_at   time,                               -- время пары (для пар не по сетке)
  kind        lesson_kind,
  title       text,                               -- тема занятия
  unique nulls not distinct (subject_id, date, slot_n, starts_at)
);

-- Фото и файлы. Разложено: subject_id задан; lesson_note_id задан → занятие,
-- null → «Материалы» дисциплины. Не разложено: status = 'unsorted' + подсказка.
create table media (
  id                  uuid primary key default gen_random_uuid(),
  status              media_status not null,
  subject_id          uuid references subjects(id) on delete set null,
  lesson_note_id      uuid references lesson_notes(id) on delete set null,
  kind                media_kind not null,
  storage_key         text not null,              -- фото: webp ≤2560px; файл: как есть
  preview_key         text,                       -- 480px webp, только фото
  file_name           text not null,
  title               text,                       -- отображаемое название файла
  page_count          int,                        -- число страниц (PDF)
  view_key            text,                       -- PDF-копия для просмотра (Office, DjVu)
  view_status         text not null default 'none', -- none | pending | ready | failed
  server_pages        boolean,                    -- скан (CCITT/JBIG2): страницы рисует сервер (MuPDF); null — не проверено
  text_status         text not null default 'none', -- поиск: none (нечего индексировать) | pending | ready | failed
  mime                text not null,
  size_bytes          int not null,
  width               int,
  height              int,
  sha256              text not null,              -- дедупликация (по исходным байтам)
  sort                int not null default 0,
  caption             text,                       -- подпись из Telegram / при загрузке
  source              media_source not null,
  uploader_id         uuid references users(id) on delete set null,
  tg_author_id        bigint,                     -- автор в Telegram (может не быть на сайте)
  tg_author_name      text,
  tg_chat_id          bigint,
  tg_message_id       bigint,
  tg_thread_id        bigint,                     -- топик форума
  tg_media_group_id   text,                       -- альбом
  posted_at           timestamptz not null,       -- время сообщения / загрузки (для сортировки)
  -- автосортировка
  suggested_subject_id     uuid references subjects(id) on delete set null,
  suggested_lesson_date    date,
  suggested_slot_n         smallint,
  suggestion_reason        text,                  -- «по времени: 2-я пара», «по тексту: ТСиСА»
  sorted_by           uuid references users(id),  -- null = разложено автоматически
  sorted_at           timestamptz,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  check (status = 'unsorted' or subject_id is not null),
  check (lesson_note_id is null or subject_id is not null)
);

-- Материалы к заданию или контрольной: файл библиотеки (можно со страницей),
-- конспект занятия или внешняя ссылка
create table task_materials (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid references assignments(id) on delete cascade,
  control_event_id  uuid references control_events(id) on delete cascade,
  media_id          uuid references media(id) on delete cascade,
  lesson_note_id    uuid references lesson_notes(id) on delete cascade,
  page              int check (page is null or page >= 1),
  url               text,
  title             text,
  sort              int not null default 0,
  check (num_nonnulls(assignment_id, control_event_id) = 1),
  check (num_nonnulls(media_id, lesson_note_id, url) = 1)
);

-- Текст страниц для поиска: слой текста PDF (MuPDF) или OCR (Tesseract, rus+eng) для сканов и фото.
create table media_pages (
  media_id    uuid not null references media(id) on delete cascade,
  page        int not null,                       -- с 1; у фото одна страница
  text        text not null,
  source      text not null,                      -- text | ocr
  tsv         tsvector generated always as (to_tsvector('russian', text)) stored,
  primary key (media_id, page)
);
create index media_pages_tsv on media_pages using gin (tsv);

create index on media (lesson_note_id, sort) where deleted_at is null;
create index on media (subject_id) where deleted_at is null and lesson_note_id is null;
create index on media (status) where status = 'unsorted' and deleted_at is null;
create unique index on media (sha256) where deleted_at is null;
create unique index on media (tg_chat_id, tg_message_id) where tg_message_id is not null;

-- Новости ---------------------------------------------------------------------
create table news (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references users(id),
  body        text not null,                      -- markdown, HTML запрещён
  is_pinned   boolean not null default false,
  send_to_tg  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Исходящие сообщения для бота ------------------------------------------------
-- Сайт кладёт, бот забирает через API, отправляет и подтверждает.
create table outbox (
  id               bigserial primary key,
  dedupe_key       text unique not null,          -- 'summary:tomorrow:2026-10-06', 'change:<id>'
  kind             text not null,                 -- 'schedule_change', 'news', 'summary', ...
  chat_id          bigint not null,               -- чат курса или telegram_id пользователя
  thread_id        bigint,                        -- топик форума
  payload          jsonb not null,                -- текст (HTML-разметка Telegram), кнопки
  status           outbox_status not null default 'pending',
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  locked_until     timestamptz,                   -- выдано боту, ждём подтверждения
  sent_at          timestamptz,
  tg_message_id    bigint,
  last_error       text,
  created_at       timestamptz not null default now()
);
create index on outbox (next_attempt_at) where status = 'pending';

-- Журнал действий (кто что поменял) ------------------------------------------
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,                     -- 'schedule_change.create', 'media.sort', ...
  entity      text not null,
  entity_id   text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

-- Преподаватели ----------------------------------------------------------------
create table teachers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,                               -- университетская почта для связи
  photo_key   text,                               -- 400×400 webp
  note        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create table teacher_subjects (
  teacher_id  uuid not null references teachers(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);

-- Успеваемость (личный трекер, примерный подсчёт) -----------------------------------
create table grading_schemes (
  subject_id  uuid primary key references subjects(id) on delete cascade,
  config      jsonb not null,                     -- модули, посещение, пункты, шкала (lib/grades/scheme.ts)
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);
create table grade_marks (
  user_id     uuid not null references users(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  key         text not null,                      -- att:<дата>|<пара>, item:<key>, adj:<модуль>
  value       real not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, subject_id, key)
);

