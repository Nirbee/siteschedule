import { cookies, headers } from "next/headers";
import { LOGIN_POLL_COOKIE } from "@/lib/auth/constants";
import { clearLoginPollCookie, setSessionCookie } from "@/lib/auth/cookies";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { pollLogin } from "@/lib/services/auth";
import { THEME_COOKIE } from "@/lib/theme/theme";

export type PollResponse = { status: "pending" | "expired" | "ok" | "slow_down" };

/** The browser waiting for a bot/QR login asks whether it was confirmed. */
export async function GET() {
  const requestHeaders = await headers();
  if (!rateLimit(`poll:${clientIp(requestHeaders)}`, 600, 60 * 1000)) {
    return Response.json({ status: "slow_down" } satisfies PollResponse);
  }

  const pollToken = (await cookies()).get(LOGIN_POLL_COOKIE)?.value;
  if (!pollToken) return Response.json({ status: "expired" } satisfies PollResponse);

  const result = await pollLogin(pollToken, { userAgent: requestHeaders.get("user-agent") });
  if (result.status === "pending")
    return Response.json({ status: "pending" } satisfies PollResponse);

  await clearLoginPollCookie();
  if (result.status === "expired")
    return Response.json({ status: "expired" } satisfies PollResponse);

  await setSessionCookie(result.sessionToken);
  (await cookies()).set(THEME_COOKIE, result.user.theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ status: "ok" } satisfies PollResponse);
}
