"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE, parseTheme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setTheme(formData: FormData): Promise<void> {
  // TODO(M1): also persist to users.theme once sessions exist.
  const theme = parseTheme(formData.get("theme")?.toString());
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  revalidatePath("/", "layout");
}
