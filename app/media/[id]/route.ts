import { getMember } from "@/lib/auth/current";
import { getServableMedia } from "@/lib/services/library";
import { contentDisposition, serveObject } from "@/lib/storage/serve";

/** Full photo or the file itself; ?download=1 asks the browser to save it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getMember())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getServableMedia(id) : undefined;
  if (!item) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const extension = item.fileName.match(/\.[^.]+$/)?.[0] ?? "";
  const name = item.title ? `${item.title}${extension}` : item.fileName;
  // PDFs and photos open in the browser; other documents always download.
  const inline = !download && (item.kind === "photo" || item.mime === "application/pdf");
  return serveObject(item.storageKey, {
    mime: item.mime,
    disposition: contentDisposition(inline ? "inline" : "attachment", name),
  });
}
