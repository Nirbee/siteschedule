import { Readable } from "node:stream";
import { objectSize, readObject } from "./disk";

/** RFC 6266 header that keeps Cyrillic names intact. */
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Streams a stored object. Keys never change, so the browser may cache it forever. */
export async function serveObject(
  key: string,
  { mime, disposition }: { mime: string; disposition?: string },
): Promise<Response> {
  const size = await objectSize(key);
  if (size === null) return new Response("Not found", { status: 404 });
  const body = Readable.toWeb(readObject(key)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "content-type": mime,
      "content-length": String(size),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      ...(disposition ? { "content-disposition": disposition } : {}),
    },
  });
}
