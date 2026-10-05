import type { HealthResponse } from "@/lib/bot-api/contract";
import { readSignedBody } from "@/lib/bot-api/verify-request";

export async function POST(request: Request) {
  const signed = await readSignedBody(request);
  if (!signed.ok) return signed.response;

  return Response.json({ ok: true, time: new Date().toISOString() } satisfies HealthResponse);
}
