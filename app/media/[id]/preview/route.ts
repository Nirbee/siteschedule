import { getMember } from "@/lib/auth/current";
import { getServableMedia } from "@/lib/services/library";
import { serveObject } from "@/lib/storage/serve";

/** 480px preview of a photo. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getMember())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getServableMedia(id) : undefined;
  if (!item?.previewKey) return new Response("Not found", { status: 404 });
  return serveObject(item.previewKey, { mime: "image/webp" });
}
