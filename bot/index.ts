import { Bot } from "grammy";
import { loadBotEnv } from "./env";
import { createSiteClient } from "./site-client";

const env = loadBotEnv();
const site = createSiteClient({ baseUrl: env.SITE_API_URL, secret: env.BOT_API_SECRET });
const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command("start", (ctx) =>
  ctx.reply("Привет! Это бот сайта «пара.». Вход и уведомления появятся совсем скоро."),
);

bot.catch((err) => {
  console.error("[bot] update failed:", err.error);
});

async function main() {
  try {
    const health = await site.health();
    console.info(`[bot] site API reachable, server time ${health.time}`);
  } catch (error) {
    // Not fatal: the site may start later. Login and notifications will retry once implemented.
    console.warn(
      "[bot] site API not reachable yet:",
      error instanceof Error ? error.message : error,
    );
  }

  const shutdown = () => void bot.stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.start({
    drop_pending_updates: true,
    onStart: (me) => console.info(`[bot] @${me.username} started (long polling)`),
  });
}

void main();
