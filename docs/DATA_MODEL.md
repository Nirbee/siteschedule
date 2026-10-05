# Модель данных и логика расписания

Полная схема — `schema.sql`. Здесь — то, что не видно из таблиц.

## Расписание = база + изменения
Базовое расписание (`schedule_entries`) описывает повторяющиеся пары семестра: день недели, номер пары, чётность. Поверх него на конкретные даты лежат изменения (`schedule_changes`). Базу никогда не правят ради разового события — только через изменения. Так сохраняется история и можно откатить ошибку (`revoked_at`).

### Функция `resolveDay(date): ResolvedLesson[]` (lib/schedule/resolve.ts)
Чистая функция над загруженными данными (сначала выборка, потом расчёт — легко тестировать).

1. Найти текущий семестр. Если дата вне семестра — пусто.
2. Чётность недели: `weekIndex = floor(daysBetween(semester.starts_on, mondayOf(date)) / 7)`; `parity = weekIndex % 2 === 0 ? first_week_parity : противоположная`.
3. Базовые пары: `schedule_entries` с `weekday = isoWeekday(date)`, `parity in ('any', parity)`, `date` внутри `valid_from..valid_to`.
4. Применить активные изменения (`revoked_at is null`) с `date = date`:
   - `cancel` → пара остаётся в списке со статусом `cancelled` (чтобы её было видно зачёркнутой).
   - `replace` → статус `replaced`, `subject/kind/room/teacher` заменяются новыми, исходные сохраняются в `original`.
   - `room` → статус `room_changed`, меняется только аудитория.
   - `move` → на исходной дате статус `moved_out` (+ куда), см. п.5.
   - `add` → новая пара со статусом `added`.
5. Добавить пары, перенесённые НА эту дату: изменения `move` с `new_date = date` → статус `moved_in` (+ откуда).
6. Отсортировать по `slot_n`. Если в одном слоте конфликт (две пары) — вернуть обе и пометить `conflict: true`, староста увидит предупреждение.

```ts
type LessonStatus = 'normal' | 'cancelled' | 'replaced' | 'room_changed' | 'moved_out' | 'moved_in' | 'added';
interface ResolvedLesson {
  date: string;            // YYYY-MM-DD, МСК
  slot: { n: number; start: string; end: string };
  subject: { id: string; name: string };
  kind: LessonKind;
  room: string | null;
  teacher: string | null;
  status: LessonStatus;
  original?: { subjectName: string; room: string | null; kind: LessonKind };
  movedTo?: { date: string; slotN: number };
  movedFrom?: { date: string; slotN: number };
  comment?: string;
  changeId?: string;
  entryId?: string;
  conflict?: boolean;
  controlEvent?: { form: string };   // рубежка в эту дату по предмету
}
```

`resolveWeek(monday)` = 6 вызовов `resolveDay` по одной общей выборке.

### Обязательные тесты (vitest)
- нечётная/чётная неделя, `any`
- пара вне `valid_from/valid_to`
- cancel, replace, room
- move: исходный день `moved_out`, целевой `moved_in`, в т.ч. на другой слот того же дня
- add в пустой слот и в занятый слот (`conflict`)
- revoked-изменение не применяется
- два изменения на одну пару — побеждает последнее по `created_at`
- граница суток по МСК (изменение создано в 23:30 UTC)

## Конспекты
`lesson_notes` — «занятие» в библиотеке, ключ `(subject_id, date, slot_n)`. Создаётся лениво при первой загрузке. При загрузке UI предлагает пары из `resolveDay` за сегодня и последние 7 дней (кроме отменённых).

Ключи в хранилище: `media/<subject_id>/<date>/<uuid>.webp`, превью `.../<uuid>_480.webp`, файлы `files/<subject_id>/<date>/<uuid>-<safe-name>`. Отдача — подписанные URL на 10 минут после проверки сессии.

## Темы
Взятие темы — одна транзакция:
```sql
update topics set assignee_id = $me, status = 'taken', taken_at = now()
where id = $id and status = 'free'
  and (select pick_deadline from topic_lists where id = list_id) > now();
```
Плюс уникальный индекс `(list_id, assignee_id)` не даёт взять вторую. 0 обновлённых строк → «тему уже забрали».

## Авторизация
Telegram Login Widget отдаёт `id, first_name, last_name, username, photo_url, auth_date, hash`. Проверка: `secret = SHA256(bot_token)`, `hash == HMAC_SHA256(data_check_string, secret)`, `auth_date` не старше 24 ч. После — upsert пользователя и сессия. Доступ к разделам только при `is_member = true` (выставляется при активации инвайта).
