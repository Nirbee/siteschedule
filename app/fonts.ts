import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";

export const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700"],
  variable: "--font-unbounded",
  display: "swap",
});

export const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
