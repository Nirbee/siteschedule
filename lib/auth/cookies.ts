import { cookies } from "next/headers";
import {
  LOGIN_POLL_COOKIE,
  LOGIN_REQUEST_TTL_MS,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./constants";

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Lets the waiting browser poll its login request; only sent to /api/auth/*. */
export async function setLoginPollCookie(token: string): Promise<void> {
  (await cookies()).set(LOGIN_POLL_COOKIE, token, {
    httpOnly: true,
    secure: sessionCookieOptions.secure,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: Math.floor(LOGIN_REQUEST_TTL_MS / 1000),
  });
}

export async function clearLoginPollCookie(): Promise<void> {
  (await cookies()).delete({ name: LOGIN_POLL_COOKIE, path: "/api/auth" });
}
