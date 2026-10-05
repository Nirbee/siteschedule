# Модель данных и логика

Структура — `schema.sql` (после M0 источник истины — `lib/db/schema.ts`). Здесь — то, что не видно из таблиц.

## Расписание = база + изменения

Базовое расписание (`schedule_entries`) описывает повторяющиеся пары семестра: день недели, номер пары, чётность (`any` / `numerator` / `denominator`), группы (`schedule_entry_groups`). Поверх него на конкретные даты лежат изменения (`schedule_changes`). Базу никогда не правят ради разового события, только через изменения. Так сохраняется история, и ошибку можно отозвать (`revoked_at`).

Общая пара 11М и 12М — это **одна** запись с двумя строками в `schedule_entry_groups`, а не две копии.

### Чётность

Неделя 1 начинается в понедельник `semesters.starts_on` (осень 2026 — 31.08.2026, числитель).

```
weekIndex = floor(daysBetween(semester.starts_on, mondayOf(date)) / 7)   // 0 для недели 1
weekNumber = weekIndex + 1                                               // «6 неделя»
parity = weekIndex % 2 === 0 ? first_week_parity : противоположная
```

Проверка: 05.10.2026 → weekIndex 5 → 6 неделя, знаменатель (совпадает с приложением МГТУ).

### `resolveDay(date, groupId, data): ResolvedLesson[]` (lib/schedule/resolve.ts)

Чистая функция над заранее загруженными данными (сначала выборка, потом расчёт).

1. Найти семестр, в который попадает дата. Если дата вне семестра — пусто.
2. Чётность недели (см. выше).
3. Базовые пары: `schedule_entries` группы `groupId` с `weekday = isoWeekday(date)`, `parity in ('any', parity)`, `date` в пределах `valid_from..valid_to`.
4. Применить активные изменения (`revoked_at is null`), которые касаются `groupId` (`schedule_change_groups`), с `date = date` и `entry_id` пары:
   - `cancel` → пара остаётся со статусом `cancelled` (видна зачёркнутой);
   - `replace` → статус `replaced`, `subject/kind/room/teacher` заменяются, исходные — в `original`;
   - `room` → статус `room_changed`, меняется только аудитория (исходная — в `original.room`);
   - `move` → на исходной дате статус `moved_out` и `movedTo`;
   - если на одну пару несколько изменений — побеждает последнее по `created_at`.
5. `add` с `date = date` → новая пара со статусом `added` (слот или «другое время»).
6. `move` с `new_date = date` → пара со статусом `moved_in` и `movedFrom`, время — `new_slot_n` или `new_starts_at..new_ends_at`, аудитория — `new_room ?? исходная`.
7. Сортировка по времени начала. Пересечение по времени двух пар, где ни одна не `self_study` и не `cancelled`/`moved_out`, → обе с `conflict: true` (староста видит предупреждение). Самостоятельная работа конфликтом не считается.

```ts
type LessonStatus =
  "normal" | "cancelled" | "replaced" | "room_changed" | "moved_out" | "moved_in" | "added";
type LessonKind = "lecture" | "seminar" | "practice" | "lab" | "self_study";
interface ResolvedLesson {
  date: string; // YYYY-MM-DD, МСК
  slotN: number | null; // null — «другое время»
  time: { start: string; end: string }; // HH:mm
  subject: { id: string; name: string; shortName: string | null };
  kind: LessonKind;
  room: string | null;
  teacher: string | null;
  status: LessonStatus;
  original?: { subjectName: string; kind: LessonKind; room: string | null };
  movedTo?: { date: string; slotN: number | null; time: { start: string; end: string } };
  movedFrom?: { date: string; slotN: number | null; time: { start: string; end: string } };
  comment?: string;
  changeId?: string;
  entryId?: string;
  conflict?: boolean;
  controlEvent?: { id: string; form: string }; // рубежка в эту дату по предмету
}
```

`resolveWeek(monday, groupId)` = 7 вызовов `resolveDay` на одной общей выборке. Сводка «N пар» не считает `self_study`, `cancelled` и `moved_out`.

### Обязательные тесты (vitest)

- числитель / знаменатель / `any`; номер недели (05.10.2026 → 6, знаменатель)
- пара вне `valid_from/valid_to`, дата вне семестра
- пара видна только своим группам; общая пара видна обеим
- cancel, replace, room
- move: исходный день `moved_out`, целевой `moved_in`, в т.ч. на другой слот того же дня, на «другое время», на субботу
- add в пустой слот, на «другое время», в занятый слот (`conflict`); add поверх самостоятельной работы — без конфликта
- изменение только для одной группы не видно другой
- revoked-изменение не применяется
- два изменения на одну пару — побеждает последнее по `created_at`
- граница суток по МСК (изменение создано в 23:30 UTC)

## Вход и сессии

**Через бота.**

1. Браузер нажимает «Войти» → сервер создаёт `login_requests` (`method = telegram`): случайный `code` (в ссылку `t.me/<bot>?start=<code>`) и случайный `poll` (в httpOnly cookie). В БД — только хеши, живёт 15 минут.
2. Пользователь жмёт Start → бот вызывает `POST /api/bot/login/confirm { code, user: {id, first_name, …}, isChatMember }`. Членство в чате бот проверяет через `getChatMember` до вызова.
3. Сервер: upsert пользователя (`bot_started = true`, `has_access ||= isChatMember`), заявка → `confirmed`. Бот отвечает в личке «Готово, вернитесь на сайт» с кнопкой-ссылкой.
4. Браузер опрашивает `GET /api/auth/poll` (раз в 2 с; при возврате на вкладку — сразу). При `confirmed` → создаётся сессия, заявка → `consumed`.

**Сессия:** случайный токен 32 байта в cookie `para_session` (httpOnly, Secure, SameSite=Lax, Max-Age 400 дней). В БД хранится `sha256(token)`. При запросе, если `last_used_at` старше суток, — продлеваем `expires_at` и cookie. Отзыв — `revoked_at`.

**QR на другом устройстве:** новое устройство создаёт заявку `method = qr` и показывает QR со ссылкой `/login/approve/<code>`. Залогиненный телефон открывает ссылку, видит «Войти на другом устройстве?» и подтверждает своей сессией → заявка `confirmed` с его `user_id` → новое устройство получает сессию через тот же poll.

**Ссылка от админа:** заявка `method = admin_link` с заданным `user_id`, живёт до 7 дней, одноразовая. Открытие ссылки сразу создаёт сессию.

**Доступ:** `has_access && !is_blocked && group.is_enabled`. Без группы — экран выбора группы. Guards: `requireUser`, `requireMember`, `requireRole('starosta')`. Проверяются на сервере в каждом server action и route handler.

**Dev-вход:** только при `NODE_ENV=development` — выбор тестового пользователя без Telegram.

## API для бота (`/api/bot/*`)

Бот не имеет доступа к БД. Каждый запрос подписан: заголовки `X-Bot-Timestamp` и `X-Bot-Signature = HMAC_SHA256(BOT_API_SECRET, timestamp + "\n" + method + "\n" + path + "\n" + body)`. Окно ±5 минут. Контракты запросов и ответов — zod-схемы в `lib/bot-api/contract.ts`, их импортируют и сайт, и бот.

| Метод                                | Назначение                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `POST /api/bot/login/confirm`        | подтверждение входа (см. выше)                                                                             |
| `POST /api/bot/outbox/claim`         | выдать до N сообщений к отправке (ставит `locked_until` +2 мин); заодно запускает планировщик              |
| `POST /api/bot/outbox/ack`           | результат: `sent` + `tg_message_id` или ошибка (повтор с backoff: 1, 5, 30 мин…, после 8 попыток `failed`) |
| `POST /api/bot/ingest`               | новое фото/файл из чата (multipart: метаданные + файл) → пайплайн автосортировки                           |
| `GET /api/bot/schedule?date=&group=` | данные для `/today`, `/week`                                                                               |
| `POST /api/bot/settings`             | подписки пользователя из `/settings`                                                                       |

### Планировщик без отдельного воркера

Бот вызывает `outbox/claim` каждые ~5 с. Перед выдачей сайт выполняет `runScheduledJobs(now)`: для каждой задачи, время которой наступило, кладёт сообщения в `outbox` с `dedupe_key` (уникален → повторный запуск ничего не дублирует):

- `summary:tomorrow:<date>` — сводка на завтра в чат, 20:00 МСК (если завтра есть пары);
- `morning:<date>:<user>` — 07:30 МСК тем, у кого `notify_morning`;
- `remind:topic:<topicId>:<user>`, `remind:control:<id>:<user>` — за день, тем, у кого `notify_reminders`;
- `deadline:topics:<listId>` — за день до `pick_deadline` в чат.

Если бот лежал, задачи выполнятся при первом вызове (не позже чем через 2 часа после срока; старее — пропускаем, чтобы не слать «сводку на вчера»).

## Конспекты, материалы и автосортировка

- `lesson_notes` — «занятие» в библиотеке, ключ `(subject_id, date, slot_n, starts_at)`. Создаётся лениво при первой привязке.
- `media` с `subject_id` и без `lesson_note_id` — «Материалы» дисциплины.
- `media.status = 'unsorted'` — «Неразобранное» с подсказкой (`suggested_*`, `suggestion_reason`).

### Пайплайн приёма (`lib/ingest/`) — общий для загрузки с сайта, импорта и бота

1. **Дедупликация:** `sha256` исходных байт и `(tg_chat_id, tg_message_id)`. Повтор — пропуск.
2. **Обработка:** фото → sharp: поворот по EXIF, удаление всех метаданных, полноразмер ≤2560px webp и превью 480px webp. HEIC поддерживаем. Файлы сохраняются как есть (имя очищается).
3. **Пачки:** сообщения одного альбома (`media_group_id`), а также сообщения одного автора с интервалом ≤2 мин считаются одной пачкой: подпись любого сообщения пачки относится ко всем, решение принимается для пачки целиком.
4. **Сигнал по тексту:** подпись и имя файла нормализуются (нижний регистр, ё→е, без пунктуации) и сравниваются с `subjects.short_name`, `name`, `aliases`. Ровно один предмет → `textSubject`.
5. **Сигнал по времени:** `resolveDay(дата posted_at по МСК, группа)` для групп топика. Пара с `start ≤ posted_at ≤ end + 30 мин`, кроме `cancelled`, `moved_out`, `self_study` → `timeLesson`.
6. **Решение:**
   - Загрузка с сайта — пользователь сам выбрал пару или материалы → `sorted`.
   - Фото + `timeLesson`, и текст молчит или указывает тот же предмет → `sorted` в занятие (автоматически, `sorted_by = null`).
   - Файл + `timeLesson` и тот же `textSubject` → `sorted` в занятие.
   - Файл + `textSubject` без пары по времени → `sorted` в «Материалы» предмета.
   - Иначе (нет сигналов, сигналы противоречат, фото вне пары) → `unsorted` с лучшей подсказкой.
7. Разбор «Неразобранного» и правка «Разложено автоматически» — только староста/админ, пишется в `audit_log`.

**Импорт из экспорта Telegram Desktop:** `pnpm import:tg <папка экспорта> --chat-id <id>` читает `result.json` и прогоняет сообщения с фото/файлами через тот же пайплайн (`source = tg_import`). Как в экспорте форума обозначен топик — проверим на реальном экспорте; сообщения из «Флуда» и топиков чужих групп пропускаются.

**Хранилище** (`lib/storage/`, локальный диск, корень `STORAGE_DIR`):

- фото: `media/<yyyy-mm>/<uuid>.webp`, превью `media/<yyyy-mm>/<uuid>_480.webp`;
- файлы: `files/<yyyy-mm>/<uuid>-<safe-name>`.

Ключи не зависят от предмета — переразложить файл = поменять строку в БД. Отдача — `GET /media/<id>` / `/media/<id>/preview`: проверка сессии и стрим с диска, `Cache-Control: private, max-age=31536000, immutable` (ключ неизменяем).

## Темы

Взятие темы — одна транзакция:

```sql
begin;
select t.capacity, t.is_done, l.pick_deadline
  from topics t join topic_lists l on l.id = t.list_id
 where t.id = $topic for update of t;
-- проверить: not is_done, (pick_deadline is null or pick_deadline > now())
select count(*) from topic_members where topic_id = $topic;   -- < capacity
insert into topic_members (topic_id, list_id, user_id) values ($topic, $list, $me);
commit;
```

`for update` по строке темы сериализует одновременные попытки, уникальный индекс `(list_id, user_id)` не даёт взять вторую тему в списке. Ошибки → «мест нет» / «у тебя уже есть тема в этом списке» / «выбор закрыт».

Статус для UI вычисляется: `done` (is_done) → «сдано»; участник я → «твоя»; участников = capacity → «занята»; > 0 → «есть места»; 0 → «свободна».
