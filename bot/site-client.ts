import type { z } from "zod";
import {
  healthResponse,
  loginConfirmResponse,
  type LoginConfirmRequest,
} from "@/lib/bot-api/contract";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign } from "@/lib/bot-api/signature";

/** Signed HTTP client for the site's /api/bot/* endpoints. The bot's only way to reach data. */
export function createSiteClient({ baseUrl, secret }: { baseUrl: string; secret: string }) {
  async function post<T extends z.ZodType>(path: string, payload: unknown, schema: T) {
    const body = JSON.stringify(payload ?? {});
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: sign({ secret, timestamp, method: "POST", path, body }),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Site API ${path} responded ${response.status}`);
    return schema.parse(await response.json()) as z.infer<T>;
  }

  return {
    health: () => post("/api/bot/health", {}, healthResponse),
    confirmLogin: (request: LoginConfirmRequest) =>
      post("/api/bot/login/confirm", request, loginConfirmResponse),
  };
}

export type SiteClient = ReturnType<typeof createSiteClient>;
