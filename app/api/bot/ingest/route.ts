import { chatIngestRequest } from "@/lib/bot-api/contract";
import { readSignedBody } from "@/lib/bot-api/verify-request";
import { ingestFromChat } from "@/lib/services/chat-ingest";

/** The bot forwards a photo/file from the course chat; it is auto-sorted like the import. */
export async function POST(request: Request) {
  const signed = await readSignedBody(request);
  if (!signed.ok) return signed.response;

  let json: unknown;
  try {
    json = JSON.parse(signed.body);
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = chatIngestRequest.safeParse(json);
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return Response.json(await ingestFromChat(parsed.data));
}
