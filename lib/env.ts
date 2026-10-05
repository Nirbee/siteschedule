import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    /** Connection pool size. Use 1 with a PGlite dev server (it shares one backend). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    APP_URL: z.url(),
    STORAGE_DIR: z.string().min(1).default("./storage"),
    BOT_API_SECRET: z.string().min(32, "BOT_API_SECRET must be at least 32 characters"),
    TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
    /** Dev only: grant access when the bot could not check chat membership (no chat configured). */
    ACCESS_WITHOUT_CHAT_CHECK: z.stringbool().default(false),
    /** Telegram ids that become admins (with access) on login — bootstraps the first admin. */
    ADMIN_TELEGRAM_IDS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((id) => Number(id.trim()))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.ACCESS_WITHOUT_CHAT_CHECK), {
    message: "ACCESS_WITHOUT_CHAT_CHECK must not be enabled in production",
    path: ["ACCESS_WITHOUT_CHAT_CHECK"],
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
