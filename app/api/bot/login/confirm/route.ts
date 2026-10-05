import { loginConfirmRequest, type LoginConfirmResponse } from "@/lib/bot-api/contract";
import { readSignedBody } from "@/lib/bot-api/verify-request";
import { env } from "@/lib/env";
import { confirmTelegramLogin } from "@/lib/services/auth";

/** The bot reports that a Telegram user pressed Start with a login code. */
export async function POST(request: Request) {
  const signed = await readSignedBody(request);
  if (!signed.ok) return signed.response;

  let json: unknown;
  try {
    json = JSON.parse(signed.body);
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = loginConfirmRequest.safeParse(json);
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const { ACCESS_WITHOUT_CHAT_CHECK, ADMIN_TELEGRAM_IDS, APP_URL } = env();
  const result = await confirmTelegramLogin(parsed.data, {
    allowUnverified: ACCESS_WITHOUT_CHAT_CHECK,
    adminTelegramIds: ADMIN_TELEGRAM_IDS,
  });
  return Response.json({ ...result, siteUrl: APP_URL } satisfies LoginConfirmResponse);
}
