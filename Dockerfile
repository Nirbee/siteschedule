# One image for the site, the bot and deploy scripts.
#   site:    node server.js
#   bot:     node dist/bot/index.cjs
#   scripts: node dist/scripts/migrate.cjs | dist/scripts/schedule-import.cjs <file>

FROM node:24-alpine AS base
RUN npm install -g pnpm@12.9.1 && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm build:scripts

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# ddjvu turns DjVu books into PDF copies for the in-site viewer.
RUN apk add --no-cache djvulibre && mkdir -p /data/storage && chown node:node /data/storage
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
