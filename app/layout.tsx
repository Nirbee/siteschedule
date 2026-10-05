import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeAttribute } from "@/lib/theme/theme";
import { jetbrainsMono, manrope, unbounded } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "пара.", template: "%s · пара." },
  description: "Расписание, темы, рубежки и конспекты учебной группы",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#111317" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="ru"
      data-theme={themeAttribute(theme)}
      className={`${unbounded.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
