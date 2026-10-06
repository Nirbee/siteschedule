// Request/response shapes of /api/bot/*, shared by the site and the bot.
import { z } from "zod";

export const healthResponse = z.object({
  ok: z.literal(true),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponse>;

/** Login codes and other tokens: 32 random bytes, base64url (43 chars). */
export const LOGIN_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const telegramUser = z.object({
  id: z.number().int().positive(),
  firstName: z.string().min(1).max(128),
  lastName: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
});
export type TelegramUser = z.infer<typeof telegramUser>;

export const loginConfirmRequest = z.object({
  code: z.string().min(1).max(64),
  user: telegramUser,
  /** null when the bot has no group chat configured and could not check membership. */
  isChatMember: z.boolean().nullable(),
});
export type LoginConfirmRequest = z.infer<typeof loginConfirmRequest>;

export const loginConfirmResponse = z.object({
  result: z.enum(["confirmed", "expired", "not_found"]),
  hasAccess: z.boolean(),
  siteUrl: z.url(),
});
export type LoginConfirmResponse = z.infer<typeof loginConfirmResponse>;

/** Bot API can download files up to 20 MB; base64 adds a third. */
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;

/** A photo or document posted in an imported topic of the course chat. */
export const chatIngestRequest = z.object({
  chatId: z.number().int(),
  messageId: z.number().int().positive(),
  threadId: z.number().int().positive(),
  mediaGroupId: z.string().max(64).nullable(),
  author: z.object({ id: z.number().int().positive(), name: z.string().max(200) }).nullable(),
  caption: z.string().max(4096),
  postedAt: z.number().int().positive(), // unix seconds
  fileName: z.string().min(1).max(255),
  /** File bytes, base64. */
  data: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_CHAT_FILE_BYTES * 4) / 3) + 4),
});
export type ChatIngestRequest = z.infer<typeof chatIngestRequest>;

export const chatIngestResponse = z.object({
  status: z.enum(["created", "duplicate", "rejected"]),
  /** Where it went: a lesson, materials, or «Неразобранное». */
  placement: z.enum(["lesson", "materials", "unsorted"]).nullable(),
});
export type ChatIngestResponse = z.infer<typeof chatIngestResponse>;
