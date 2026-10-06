// Server-side page images for scanned PDFs (MuPDF `mutool draw` → webp), cached on disk.
// Used where pdf.js is too slow or fails (CCITT/JBIG2 scans). Needs `mutool` (mupdf-tools in
// the Docker image); on a dev machine without it the viewer falls back to pdf.js.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { heavyJob } from "@/lib/ingest/limit";
import { objectPath, objectSize, writeObject } from "./disk";
import type { PageWidth } from "./page-render-widths";

export { isPageWidth, PAGE_WIDTHS, type PageWidth } from "./page-render-widths";

let available: Promise<boolean> | null = null;

/** Whether `mutool` is installed (checked once per process). */
export function mutoolAvailable(): Promise<boolean> {
  available ??= new Promise((resolve) => {
    const child = spawn("mutool", ["-v"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", () => resolve(true));
  });
  return available;
}

export function pageCacheKey(sourceKey: string, page: number, width: PageWidth): string {
  const id = createHash("sha1").update(sourceKey).digest("hex").slice(0, 16);
  return `cache/pages/${id}/${page}-${width}.webp`;
}

async function mutoolDraw(pdfPath: string, page: number, width: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "para-page-"));
  const out = path.join(dir, "page.png");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "mutool",
        ["draw", "-q", "-F", "png", "-w", String(width), "-o", out, pdfPath, String(page)],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`mutool exited ${code}: ${stderr.slice(0, 200)}`)),
      );
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Returns the cache key of the rendered page, rendering it first if needed. */
export async function renderPage(
  sourceKey: string,
  page: number,
  width: PageWidth,
): Promise<string> {
  const key = pageCacheKey(sourceKey, page, width);
  if ((await objectSize(key)) !== null) return key;
  await heavyJob(async () => {
    if ((await objectSize(key)) !== null) return; // rendered meanwhile by another request
    const png = await mutoolDraw(objectPath(sourceKey), page, width);
    const webp = await sharp(png).webp({ quality: 80 }).toBuffer();
    await writeObject(key, webp);
  });
  return key;
}
