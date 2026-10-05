import { Bot } from "grammy";
import { LOGIN_CODE_PATTERN } from "@/lib/bot-api/contract";
import { loadBotEnv } from "./env";
import { handleLoginStart, linkKeyboard } from "./login";
import { createSiteClient } from "./site-client";

const env = loadBotEnv();
const siteUrl = env.SITE_PUBLIC_URL ?? env.SITE_API_URL;
const site = createSiteClient({ baseUrl: env.SITE_API_URL, secret: env.BOT_API_SECRET });
const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Commands are for private chats only; in the group the bot stays silent.
const dm = bot.chatType("private");

dm.command("start", async (ctx) => {
  const payload = ctx.match.trim();
  if (LOGIN_CODE_PATTERN.test(payload)) {
    await handleLoginStart(ctx, payload, { site, chatId: env.TELEGRAM_CHAT_ID });
    return;
  }
  await ctx.reply(
    "Привет! Это бот сайта «пара.» — расписание, темы и конспекты группы.\n\nЧтобы войти, откройте сайт и нажмите «Войти через Telegram».",
    { reply_markup: linkKeyboard("Открыть сайт", siteUrl) },
  );
});

// Logs the chat id when the bot is added to a group — needed for TELEGRAM_CHAT_ID.
bot.on("my_chat_member", (ctx) => {
  const { chat, new_chat_member: me } = ctx.myChatMember;
  if (chat.type === "private") return;
  console.info(
    `[bot] chat "${"title" in chat ? chat.title : ""}" id=${chat.id}: bot is now ${me.status}`,
  );
});

bot.catch((err) => {
  console.error("[bot] update failed:", err.error instanceof Error ? err.error.message : err.error);
});

async function main() {
  try {
    const health = await site.health();
    console.info(`[bot] site API reachable, server time ${health.time}`);
  } catch (error) {
    // Not fatal: the site may start later.
    console.warn(
      "[bot] site API not reachable yet:",
      error instanceof Error ? error.message : error,
    );
  }
  if (env.TELEGRAM_CHAT_ID === undefined) {
    console.warn("[bot] TELEGRAM_CHAT_ID is not set: chat membership is not checked on login");
  }

  const shutdown = () => void bot.stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.start({
    drop_pending_updates: true,
    allowed_updates: ["message", "my_chat_member"],
    onStart: (me) => console.info(`[bot] @${me.username} started (long polling)`),
  });
}

void main();
