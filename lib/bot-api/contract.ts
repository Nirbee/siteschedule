// Request/response shapes of /api/bot/*, shared by the site and the bot.
import { z } from "zod";

export const healthResponse = z.object({
  ok: z.literal(true),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponse>;
