import { createHash, randomBytes } from "node:crypto";
import { LOGIN_CODE_PATTERN } from "@/lib/bot-api/contract";

/** URL-safe random token (32 bytes → 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Shape of codes produced by randomToken(32); used to reject garbage early. */
export const TOKEN_PATTERN = LOGIN_CODE_PATTERN;
