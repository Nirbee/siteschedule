import { Readable } from "node:stream";
import { objectSize, readObject } from "./disk";

/** RFC 6266 header that keeps Cyrillic names intact. */
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * A single "bytes=start-end" range (what PDF viewers ask for). Returns null for no/unsupported
 * ranges (→ full response) and "invalid" for ranges outside the file (→ 416).
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    // suffix range: last N bytes
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  return start > end || start >= size ? "invalid" : { start, end };
}

/** Streams a stored object, honouring Range. Keys never change, so it may be cached forever. */
export async function serveObject(
  key: string,
  {
    mime,
    disposition,
    rangeHeader,
  }: { mime: string; disposition?: string; rangeHeader?: string | null },
): Promise<Response> {
  const size = await objectSize(key);
  if (size === null) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    ...(disposition ? { "content-disposition": disposition } : {}),
  };

  const range = parseRange(rangeHeader ?? null, size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  if (range) {
    const body = Readable.toWeb(readObject(key, range)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }
  const body = Readable.toWeb(readObject(key)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: { ...headers, "content-length": String(size) } });
}
