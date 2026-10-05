// HMAC signing for site <-> bot requests. Shared by the site (verify) and the bot (sign);
// must stay free of database / Next.js imports.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_HEADER = "x-bot-timestamp";
export const SIGNATURE_HEADER = "x-bot-signature";
/** Allowed clock skew between bot and site. */
export const MAX_SKEW_SECONDS = 300;

export interface SignInput {
  secret: string;
  timestamp: number; // unix seconds
  method: string;
  path: string; // pathname + search, e.g. "/api/bot/health"
  body: string;
}

export function sign({ secret, timestamp, method, path, body }: SignInput): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${body}`)
    .digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" };

export function verify(
  input: Omit<SignInput, "timestamp"> & {
    timestampHeader: string | null;
    signatureHeader: string | null;
    now?: number; // unix seconds, for tests
  },
): VerifyResult {
  const { timestampHeader, signatureHeader, now = Math.floor(Date.now() / 1000) } = input;
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing" };

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = Buffer.from(sign({ ...input, timestamp }), "hex");
  const actual = Buffer.from(signatureHeader, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}
