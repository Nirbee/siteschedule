import { z } from "zod";
import { withoutEmpty } from "@/lib/env";

const botEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required (get one from @BotFather)"),
  SITE_API_URL: z.url(),
  BOT_API_SECRET: z.string().min(32, "BOT_API_SECRET must be at least 32 characters"),
});

export type BotEnv = z.infer<typeof botEnvSchema>;

export function loadBotEnv(): BotEnv {
  const parsed = botEnvSchema.safeParse(withoutEmpty(process.env));
  if (!parsed.success) {
    throw new Error(`Invalid bot environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
