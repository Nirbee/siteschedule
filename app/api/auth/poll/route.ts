import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current";
import { LOGIN_POLL_COOKIE, POLL_TOKEN_HEADER } from "@/lib/auth/constants";
import { clearLoginPollCookie, setSessionCookie } from "@/lib/auth/cookies";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { pollLogin } from "@/lib/services/auth";
import { THEME_COOKIE } from "@/lib/theme/theme";

export type PollResponse = { status: "pending" | "expired" | "ok" | "slow_down" };

const reply = (status: PollResponse["status"]) => Response.json({ status } satisfies PollResponse);

/** The browser waiting for a bot/QR login asks whether it was confirmed. */
export async function GET() {
  const requestHeaders = await headers();
  if (!rateLimit(`poll:${clientIp(requestHeaders)}`, 600, 60 * 1000)) return reply("slow_down");

  const pollToken =
    requestHeaders.get(POLL_TOKEN_HEADER) ?? (await cookies()).get(LOGIN_POLL_COOKIE)?.value;
  const result = pollToken
    ? await pollLogin(pollToken, { userAgent: requestHeaders.get("user-agent") })
    : ({ status: "expired" } as const);
  if (result.status === "pending") return reply("pending");

  if (result.status === "expired") {
    if (pollToken) await clearLoginPollCookie();
    // Another tab of this browser may have already finished the login.
    return reply((await getCurrentUser()) ? "ok" : "expired");
  }

  await clearLoginPollCookie();
  await setSessionCookie(result.sessionToken);
  (await cookies()).set(THEME_COOKIE, result.user.theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return reply("ok");
}
