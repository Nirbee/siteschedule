import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { SiteClient } from "./site-client";

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

/** Login replies disappear after this delay so the chat with the bot stays clean. */
export const LOGIN_REPLY_TTL_MS = 60_000;

/** Deletes a message later; failures (already deleted, too old) are ignored. */
export function scheduleDelete(
  api: Pick<Api, "deleteMessage">,
  chatId: number,
  messageId: number,
  delayMs = LOGIN_REPLY_TTL_MS,
): void {
  setTimeout(() => {
    api.deleteMessage(chatId, messageId).catch(() => {});
  }, delayMs).unref();
}

/** Whether the user is in the course chat; null when no chat is configured or the check failed. */
export async function checkChatMember(
  api: Api,
  chatId: number | undefined,
  userId: number,
): Promise<boolean | null> {
  if (chatId === undefined) return null;
  try {
    const member = await api.getChatMember(chatId, userId);
    if (MEMBER_STATUSES.has(member.status)) return true;
    return member.status === "restricted" ? member.is_member : false;
  } catch (error) {
    console.warn("[bot] getChatMember failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Telegram refuses inline URL buttons pointing at localhost, so only add them for real hosts. */
export function linkKeyboard(text: string, url: string): InlineKeyboard | undefined {
  return url.startsWith("https://") ? new InlineKeyboard().url(text, url) : undefined;
}

export async function handleLoginStart(
  ctx: Context,
  code: string,
  { site, chatId }: { site: SiteClient; chatId: number | undefined },
) {
  const from = ctx.from;
  if (!from || from.is_bot) return;
  // The "/start <code>" message is useless after this point.
  await ctx.deleteMessage().catch(() => {});

  const isChatMember = await checkChatMember(ctx.api, chatId, from.id);
  const result = await site.confirmLogin({
    code,
    user: {
      id: from.id,
      firstName: from.first_name,
      ...(from.last_name ? { lastName: from.last_name } : {}),
      ...(from.username ? { username: from.username } : {}),
    },
    isChatMember,
  });

  if (result.result !== "confirmed") {
    const sent = await ctx.reply(
      "Эта ссылка для входа уже не действует. Вернитесь на сайт и нажмите «Войти через Telegram» ещё раз.",
      { reply_markup: linkKeyboard("Открыть сайт", new URL("/login", result.siteUrl).toString()) },
    );
    scheduleDelete(ctx.api, sent.chat.id, sent.message_id);
    return;
  }

  if (!result.hasAccess) {
    // Kept on purpose: the person needs to read it and contact the starosta.
    await ctx.reply(
      "Вход подтверждён, но вас нет в чате группы, поэтому доступа к сайту пока нет. Если это ошибка — напишите старосте.",
    );
    return;
  }

  const sent = await ctx.reply("Готово ✅ Вернитесь в браузер — вход завершится сам.", {
    reply_markup: linkKeyboard("Вернуться на сайт", result.siteUrl),
  });
  scheduleDelete(ctx.api, sent.chat.id, sent.message_id);
}
