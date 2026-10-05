"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current";
import { setUserTheme } from "@/lib/services/users";
import { THEME_COOKIE, parseTheme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setTheme(formData: FormData): Promise<void> {
  const theme = parseTheme(formData.get("theme")?.toString());
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  // Saved to the account too, so a new device gets the same theme after login.
  const current = await getCurrentUser();
  if (current) await setUserTheme(current.user.id, theme);
  revalidatePath("/", "layout");
}
