"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { setLoginPollCookie, setSessionCookie } from "@/lib/auth/cookies";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession, startLogin } from "@/lib/services/auth";

export type StartLoginResult =
  { ok: true; botUrl: string; pollToken: string; expiresAt: string } | { ok: false; error: string };

export type StartQrResult =
  | { ok: true; qrSvg: string; approveUrl: string; pollToken: string; expiresAt: string }
  | { ok: false; error: string };

const TOO_MANY = "Слишком много попыток входа. Подождите пару минут.";

async function allowed(kind: string): Promise<boolean> {
  // Generous: a whole group may log in at once from the same university Wi-Fi IP.
  return rateLimit(`login:${kind}:${clientIp(await headers())}`, 60, 10 * 60 * 1000);
}

export async function startTelegramLoginAction(): Promise<StartLoginResult> {
  const username = env().TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return { ok: false, error: "Вход через Telegram ещё не настроен." };
  if (!(await allowed("telegram"))) return { ok: false, error: TOO_MANY };

  const { code, pollToken, expiresAt } = await startLogin("telegram");
  await setLoginPollCookie(pollToken);
  return {
    ok: true,
    botUrl: `https://t.me/${username}?start=${code}`,
    pollToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function startQrLoginAction(): Promise<StartQrResult> {
  if (!(await allowed("qr"))) return { ok: false, error: TOO_MANY };

  const { code, pollToken, expiresAt } = await startLogin("qr");
  await setLoginPollCookie(pollToken);
  const approveUrl = new URL(`/login/approve/${code}`, env().APP_URL).toString();
  const qrSvg = await QRCode.toString(approveUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  return { ok: true, qrSvg, approveUrl, pollToken, expiresAt: expiresAt.toISOString() };
}

/** Development only: log in as a seeded user without Telegram. */
export async function devLoginAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV !== "development") throw new Error("Dev login is disabled");
  const userId = z.uuid().parse(formData.get("userId"));
  const token = await createSession(db(), userId, {
    userAgent: (await headers()).get("user-agent"),
  });
  await setSessionCookie(token);
  redirect("/");
}
