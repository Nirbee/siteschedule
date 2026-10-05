import { env } from "@/lib/env";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./signature";

/**
 * Reads the raw body and checks the bot signature.
 * Returns the body on success, or a 401 response to return from the route handler.
 */
export async function readSignedBody(
  request: Request,
): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  const body = await request.text();
  const url = new URL(request.url);
  const result = verify({
    secret: env().BOT_API_SECRET,
    method: request.method,
    path: url.pathname + url.search,
    body,
    timestampHeader: request.headers.get(TIMESTAMP_HEADER),
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
  });
  if (!result.ok) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { ok: true, body };
}
