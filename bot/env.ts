import { z } from "zod";
import { withoutEmpty } from "@/lib/env";

const botEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required (get one from @BotFather)"),
  SITE_API_URL: z.url(),
  /** Public site address for links in messages (defaults to SITE_API_URL). */
  SITE_PUBLIC_URL: z.url().optional(),
  BOT_API_SECRET: z.string().min(32, "BOT_API_SECRET must be at least 32 characters"),
  /** Course group chat: membership there grants access to the site. */
  TELEGRAM_CHAT_ID: z.coerce.number().int().optional(),
});

export type BotEnv = z.infer<typeof botEnvSchema>;

export function loadBotEnv(): BotEnv {
  const parsed = botEnvSchema.safeParse(withoutEmpty(process.env));
  if (!parsed.success) {
    throw new Error(`Invalid bot environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
