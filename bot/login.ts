import type { Api, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { SiteClient } from "./site-client";

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

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
    await ctx.reply(
      "Эта ссылка для входа уже не действует. Вернитесь на сайт и нажмите «Войти через Telegram» ещё раз.",
      { reply_markup: linkKeyboard("Открыть сайт", new URL("/login", result.siteUrl).toString()) },
    );
    return;
  }

  const text = result.hasAccess
    ? "Готово ✅ Вернитесь в браузер — вход завершится сам."
    : "Вход подтверждён, но вас нет в чате группы, поэтому доступа к сайту пока нет. Если это ошибка — напишите старосте.";
  await ctx.reply(text, {
    reply_markup: linkKeyboard("Вернуться на сайт", result.siteUrl),
  });
}
