import { getMember } from "@/lib/auth/current";
import { getServableMedia } from "@/lib/services/library";
import { contentDisposition, serveObject } from "@/lib/storage/serve";

/** The photo or file itself (Range-aware for the PDF viewer); ?download=1 saves it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getMember();
  if (!current) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getServableMedia(id, current.user) : undefined;
  if (!item) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const extension = item.fileName.match(/\.[^.]+$/)?.[0] ?? "";
  const name = item.title ? `${item.title}${extension}` : item.fileName;
  const inline = !download && (item.kind === "photo" || item.mime === "application/pdf");
  return serveObject(item.storageKey, {
    mime: item.mime,
    disposition: contentDisposition(inline ? "inline" : "attachment", name),
    rangeHeader: request.headers.get("range"),
  });
}
