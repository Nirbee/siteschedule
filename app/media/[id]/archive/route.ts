import { readFile } from "node:fs/promises";
import { getMember } from "@/lib/auth/current";
import { extensionOf } from "@/lib/ingest/detect";
import { listZip, readZipEntry } from "@/lib/ingest/zip";
import { getServableMedia } from "@/lib/services/library";
import { objectPath } from "@/lib/storage/disk";
import { contentDisposition } from "@/lib/storage/serve";

const VIEWABLE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain; charset=utf-8",
};

/** One file from inside a ZIP: ?entry=<index>. Viewable types open inline, others download. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getMember();
  if (!current) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const item = /^[0-9a-f-]{36}$/.test(id) ? await getServableMedia(id, current.user) : undefined;
  if (!item || extensionOf(item.fileName) !== "zip")
    return new Response("Not found", { status: 404 });

  const index = Number(new URL(request.url).searchParams.get("entry"));
  try {
    const zip = await readFile(objectPath(item.storageKey));
    const entry = listZip(zip).find((e) => e.index === index && !e.isDirectory);
    if (!entry) return new Response("Not found", { status: 404 });
    const data = readZipEntry(zip, entry);
    const fileName = entry.name.split("/").pop() ?? "file";
    const mime = VIEWABLE[extensionOf(fileName)];
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": mime ?? "application/octet-stream",
        "content-length": String(data.length),
        "content-disposition": contentDisposition(mime ? "inline" : "attachment", fileName),
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Cannot read archive", { status: 422 });
  }
}
