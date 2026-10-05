import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  APP_URL: z.url(),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  BOT_API_SECRET: z.string().min(32, "BOT_API_SECRET must be at least 32 characters"),
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** `KEY=` in .env means "not set", not an empty string. */
export function withoutEmpty(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

/** Validated server env. Lazy, so `next build` works without a .env file. */
export function env(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(withoutEmpty(process.env));
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
