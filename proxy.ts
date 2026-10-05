import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/constants";

/**
 * Sliding session cookie: every full page load re-issues the cookie for another 400 days,
 * so people who keep using the site are never logged out. Validity is checked in the app.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.headers.get("accept")?.includes("text/html")) {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon|.*\.[a-z0-9]+$).*)"],
};
