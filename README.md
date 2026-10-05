# пара.

Сайт учебных групп ИУ8-11М и ИУ8-12М: расписание с изменениями, темы, рубежки, конспекты и материалы, новости и Telegram-бот.

Документация: [CLAUDE.md](CLAUDE.md) (стек и правила), [docs/SPEC.md](docs/SPEC.md) (что делаем), [docs/ROADMAP.md](docs/ROADMAP.md) (этапы).

## Что нужно

- Node.js 24+, pnpm (`npm i -g pnpm`)
- Docker Desktop (для локального PostgreSQL) — или PostgreSQL 17, установленный обычным способом
- Для бота: токен тестового бота от @BotFather и VPN (Telegram API из РФ без него недоступен)

## Запуск

```bash
cp .env.example .env          # заполнить BOT_API_SECRET (команда генерации — в файле)
pnpm install
docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Сайт: http://localhost:3000. Бот (в отдельном терминале, нужен `TELEGRAM_BOT_TOKEN`): `pnpm bot:dev`.

## Команды

| Команда                                      | Что делает                                     |
| -------------------------------------------- | ---------------------------------------------- |
| `pnpm dev` / `pnpm bot:dev`                  | сайт / бот в режиме разработки                 |
| `pnpm db:generate`                           | миграция из изменений `lib/db/schema.ts`       |
| `pnpm db:migrate`                            | применить миграции                             |
| `pnpm db:seed`                               | пересоздать демо-данные (стирает все таблицы!) |
| `pnpm db:studio`                             | просмотр БД в браузере                         |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | проверки (то же гоняет CI)                     |

## Данные

Репозиторий публичный. Здесь только демо-данные; реальное расписание, люди и экспорты чата — только на сервере и в `data/private/` (игнорируется git).
