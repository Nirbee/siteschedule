# Деплой

Один сервер (Ubuntu 24.04, Docker). Всё лежит в `/opt/para`: `compose.yml`, `Caddyfile`, `update.sh`, `backup.sh` (копии из `deploy/`) и `.env` (только на сервере, права 600).

## Как это устроено
- Push в `main` → CI (lint, typecheck, test, build) → workflow **Image** собирает образ `ghcr.io/nirbee/siteschedule:latest` (и тег с SHA коммита). Сервер ничего не собирает.
- Один образ: сайт (`node server.js`), бот (`node dist/bot/index.cjs`), скрипты (`dist/scripts/*.cjs`).
- Gotenberg (LibreOffice) — отдельный контейнер для PDF-копий Office-файлов, доступен только сайту по `http://gotenberg:3000`, лимит памяти 1 ГБ.
- В образе сайта: `ddjvu` (DjVu → PDF), `mutool` (MuPDF: страницы сканов, текст PDF), `tesseract` с языками rus+eng (распознавание сканов и фото для поиска; один поток, ~4 с на страницу — после первого выката старые файлы индексируются в фоне несколько часов).
- Caddy получает HTTPS-сертификат сам, `www.` перенаправляет на основной домен. Наружу открыты только 80/443; Postgres доступен только внутри Docker-сети.

## Первый запуск
```sh
cd /opt/para
./update.sh                                   # pull, миграции, запуск
docker compose run --rm -v /opt/para/data:/import:ro app \
  node dist/scripts/schedule-import.cjs /import/schedule.json
echo "30 4 * * * root /opt/para/backup.sh >> /var/log/para-backup.log 2>&1" > /etc/cron.d/para-backup
```

## Обновление
```sh
/opt/para/update.sh
```
Откат на конкретный коммит: `IMAGE_TAG=<sha>` в `.env`, затем `./update.sh`.

## Полезное
- Логи: `docker compose logs -f app` / `bot` / `caddy`
- База: `docker compose exec postgres psql -U para para`
- Бэкапы: `/var/backups/para` (дамп `pg_dump -Fc` + архив файлов), хранятся 14 дней. Восстановление: `docker compose exec -T postgres pg_restore -U para -d para --clean < db-….dump`.
- Бот с одним токеном может работать только в одном месте: локальный `pnpm bot:dev` с прод-токеном конфликтует с ботом на сервере (409 Conflict). Для разработки — отдельный тестовый бот.
- Бот собирается esbuild с `--keep-names`: без него класс `AbortSignal` из полифила grammY переименовывается в бандле, node-fetch отвергает сигнал, и каждый запрос к Telegram падает («Network request for 'getMe' failed!»). Бот при этом не падает, а молча не стартует.

## Импорт истории чата (Telegram Desktop)

1. Экспорт: группа → ⋮ → «Экспорт истории чата» → Фото + Файлы, формат JSON, за всё время (скрипт сам возьмёт с начала семестра; полная история нужна, чтобы найти топики по цепочкам ответов).
2. Папку экспорта скопировать на сервер в `/opt/para/tg-export` (не в git).
3. Пробный прогон (ничего не пишет, печатает отчёт):
   `docker compose run --rm -v /opt/para/tg-export:/import:ro app node dist/scripts/import-tg.cjs /import --topics 1,2,16 --review 2` (по папке на каждый топик, если экспорт делался по топикам; `--review` — топик объявлений: всё оттуда в «Неразобранное»)
4. Если отчёт устраивает — то же самое с `--apply`. Повторный запуск пропускает уже импортированное.
5. Разбор «Неразобранного» — в Панели старосты. После импорта сайт в фоне делает PDF-копии и распознаёт текст.
6. Удалить `/opt/para/tg-export` после импорта (в нём личные фото и переписка).

## Бот: новые фото из чата

В `.env` на сервере: `TELEGRAM_CHAT_ID=-100…`, `TELEGRAM_INGEST_TOPICS=1,2,16` и `INGEST_REVIEW_TOPICS=2` (топик объявлений — всегда в «Неразобранное»), затем `docker compose up -d app bot`. Боту нужна админка в группе (или privacy mode off в @BotFather). С `TELEGRAM_CHAT_ID` при входе ещё и проверяется членство в чате: участники получают доступ сами.

