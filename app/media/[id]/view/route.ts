import { getMember } from "@/lib/auth/current";
import { getServableMedia } from "@/lib/services/library";
import { serveObject } from "@/lib/storage/serve";

/** PDF copy of an Office/DjVu file, for the in-site viewer. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getMember())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getServableMedia(id) : undefined;
  if (!item?.viewKey || item.viewStatus !== "ready")
    return new Response("Not found", { status: 404 });
  return serveObject(item.viewKey, {
    mime: "application/pdf",
    rangeHeader: request.headers.get("range"),
  });
}
