export const SESSION_COOKIE = "para_session";
export const LOGIN_POLL_COOKIE = "para_login";
/** The waiting tab sends its own poll token; the cookie is the fallback for a new tab. */
export const POLL_TOKEN_HEADER = "x-login-poll";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Browsers cap cookie lifetime at 400 days; sessions slide while the user keeps visiting. */
export const SESSION_TTL_MS = 400 * DAY_MS;
/** Renew session expiry in the database at most once a day. */
export const SESSION_RENEW_AFTER_MS = DAY_MS;
export const LOGIN_REQUEST_TTL_MS = 15 * 60 * 1000;
export const ADMIN_LINK_TTL_MS = 7 * DAY_MS;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
