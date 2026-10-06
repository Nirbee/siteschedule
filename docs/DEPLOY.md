# Деплой

Один сервер (Ubuntu 24.04, Docker). Всё лежит в `/opt/para`: `compose.yml`, `Caddyfile`, `update.sh`, `backup.sh` (копии из `deploy/`) и `.env` (только на сервере, права 600).

## Как это устроено
- Push в `main` → CI (lint, typecheck, test, build) → workflow **Image** собирает образ `ghcr.io/nirbee/siteschedule:latest` (и тег с SHA коммита). Сервер ничего не собирает.
- Один образ: сайт (`node server.js`), бот (`node dist/bot/index.cjs`), скрипты (`dist/scripts/*.cjs`).
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
