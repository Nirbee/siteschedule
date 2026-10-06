import { getMember } from "@/lib/auth/current";
import { getServableMedia } from "@/lib/services/library";
import { isPageWidth, mutoolAvailable, renderPage } from "@/lib/storage/page-render";
import { serveObject } from "@/lib/storage/serve";

/** One page of a scanned PDF as a webp image: /media/<id>/page/<n>?w=1200 (&src=view for copies). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const current = await getMember();
  if (!current) return new Response("Unauthorized", { status: 401 });
  const { id, n } = await params;
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getServableMedia(id, current.user) : undefined;
  if (!item) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const width = Number(url.searchParams.get("w") ?? 1200);
  const page = Number(n);
  const source = url.searchParams.get("src") === "view" ? item.viewKey : item.storageKey;
  if (!source || !isPageWidth(width)) return new Response("Bad request", { status: 400 });
  if (!Number.isInteger(page) || page < 1 || (item.pageCount !== null && page > item.pageCount)) {
    return new Response("Not found", { status: 404 });
  }
  if (!(await mutoolAvailable()))
    return new Response("Page rendering unavailable", { status: 503 });

  try {
    const key = await renderPage(source, page, width);
    return serveObject(key, { mime: "image/webp" });
  } catch {
    return new Response("Cannot render page", { status: 422 });
  }
}
