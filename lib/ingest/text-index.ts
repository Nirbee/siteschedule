// Full-text index: the text of every page (MuPDF text layer, or Tesseract OCR for scans and
// photos) goes to media_pages. Runs in the background, one page at a time, and resumes after
// a restart from the last stored page.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, asc, eq, isNull, max, ne } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/lib/db/client";
import { media, mediaPages } from "@/lib/db/schema";
import { objectPath } from "@/lib/storage/disk";
import { needsViewCopy } from "./convert";
import { detectUpload, extensionOf } from "./detect";
import { heavyJob } from "./limit";
import { stripRepeatedLines, textFromTsv } from "./ocr-layout";
import { processPhoto } from "./photo";
import { decodeText } from "./text";

/** Pages with fewer letters than this are treated as scans and OCR'd. */
const MIN_TEXT_LETTERS = 40;
const MAX_PAGE_CHARS = 20_000;

/** Files whose text we can index (photos are always indexable). */
export function isTextIndexable(fileName: string): boolean {
  const ext = extensionOf(fileName);
  return ext === "pdf" || ext === "txt" || ext === "csv" || needsViewCopy(fileName);
}

export class ToolUnavailable extends Error {}

function run(command: string, args: string[], env?: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    const out: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "ENOENT" ? new ToolUnavailable(`${command} not installed`) : error),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 200)}`)),
    );
  });
}

/**
 * Joins words hyphenated across lines («вари-\nанте» → «варианте»), collapses spaces and drops
 * empty lines. Line breaks are kept: running heads are recognised by lines (ocr-layout.ts).
 */
export function cleanText(raw: string): string {
  return raw
    .replace(/(\p{L})-[ \t]*\r?\n\s*(\p{L})/gu, "$1$2")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_PAGE_CHARS);
}

const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;

/** OCR with layout: sideways running heads (and, for book pages, margin marks) are dropped. */
async function ocrImage(png: Buffer, { dropMargins }: { dropMargins: boolean }): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "para-ocr-"));
  try {
    const file = path.join(dir, "page.png");
    await writeFile(file, png);
    // One thread per job: the server has two cores and also serves the site.
    const out = await run("tesseract", [file, "-", "-l", "rus+eng", "--psm", "3", "tsv"], {
      OMP_THREAD_LIMIT: "1",
    });
    return textFromTsv(out.toString("utf8"), { dropMargins });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function pdfPageText(
  pdfPath: string,
  page: number,
): Promise<{ text: string; source: "text" | "ocr" }> {
  const layer = cleanText(
    (await run("mutool", ["draw", "-q", "-F", "txt", "-o", "-", pdfPath, String(page)])).toString(
      "utf8",
    ),
  );
  if (letters(layer) >= MIN_TEXT_LETTERS) return { text: layer, source: "text" };
  const png = await run("mutool", [
    "draw",
    "-q",
    "-F",
    "png",
    "-r",
    "200",
    "-o",
    "-",
    pdfPath,
    String(page),
  ]);
  return { text: cleanText(await ocrImage(png, { dropMargins: true })), source: "ocr" };
}

/** Page count without loading the file: `mutool show` reads just the page tree root. */
async function pdfPages(pdfPath: string): Promise<number> {
  const out = (await run("mutool", ["show", pdfPath, "Root/Pages/Count"])).toString("utf8");
  const count = Number(out.trim());
  if (!Number.isInteger(count) || count < 1) throw new Error("Cannot read page count");
  return count;
}

async function storePage(mediaId: string, page: number, text: string, source: "text" | "ocr") {
  await db().insert(mediaPages).values({ mediaId, page, text, source }).onConflictDoNothing();
}

/** Indexes one media item, continuing after the last stored page. */
export async function indexMedia(item: typeof media.$inferSelect): Promise<void> {
  if (item.kind === "photo") {
    const png = await sharp(objectPath(item.storageKey)).png().toBuffer();
    const text = cleanText(await heavyJob(() => ocrImage(png, { dropMargins: false })));
    await storePage(item.id, 1, text, "ocr");
    return;
  }

  const ext = extensionOf(item.fileName);
  if (ext === "txt" || ext === "csv") {
    const text = cleanText(decodeText(await readFile(objectPath(item.storageKey))));
    await storePage(item.id, 1, text, "text");
    return;
  }

  const key = ext === "pdf" ? item.storageKey : item.viewKey;
  if (!key) throw new Error("No PDF to index");
  const pdfPath = objectPath(key);
  const total = item.pageCount ?? (await pdfPages(pdfPath));
  const [done] = await db()
    .select({ last: max(mediaPages.page) })
    .from(mediaPages)
    .where(eq(mediaPages.mediaId, item.id));
  for (let page = (done?.last ?? 0) + 1; page <= total; page++) {
    const result = await heavyJob(() => pdfPageText(pdfPath, page)).catch((error: unknown) => {
      if (error instanceof ToolUnavailable) throw error;
      // One broken page should not stop a whole book.
      return { text: "", source: "text" as const };
    });
    await storePage(item.id, page, result.text, result.source);
    // Stop early if the file was deleted meanwhile.
    const [still] = await db()
      .select({ deletedAt: media.deletedAt })
      .from(media)
      .where(eq(media.id, item.id));
    if (!still || still.deletedAt) return;
  }
  await stripRunningHeads(item.id);
}

/** Once a document is fully indexed: removes lines repeated at the top/bottom of many pages. */
export async function stripRunningHeads(mediaId: string): Promise<void> {
  const pages = await db()
    .select({ page: mediaPages.page, text: mediaPages.text })
    .from(mediaPages)
    .where(eq(mediaPages.mediaId, mediaId))
    .orderBy(asc(mediaPages.page));
  const cleaned = stripRepeatedLines(pages.map((p) => p.text));
  for (const [i, { page, text }] of pages.entries()) {
    if (cleaned[i] === text) continue;
    await db()
      .update(mediaPages)
      .set({ text: cleaned[i]! })
      .where(and(eq(mediaPages.mediaId, mediaId), eq(mediaPages.page, page)));
  }
}

let running = false;

/** Works through pending items; safe to call often (only one loop runs). */
export async function processTextIndex(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const [next] = await db()
        .select()
        .from(media)
        .where(
          and(
            eq(media.textStatus, "pending"),
            isNull(media.deletedAt),
            ne(media.viewStatus, "pending"), // Office/DjVu: wait for the PDF copy
          ),
        )
        .orderBy(asc(media.createdAt))
        .limit(1);
      if (!next) break;

      if (next.kind === "file" && needsViewCopy(next.fileName) && next.viewStatus !== "ready") {
        await db().update(media).set({ textStatus: "none" }).where(eq(media.id, next.id));
        continue;
      }
      try {
        await indexMedia(next);
        await db().update(media).set({ textStatus: "ready" }).where(eq(media.id, next.id));
      } catch (error) {
        if (error instanceof ToolUnavailable) break; // dev machine: leave it for production
        console.error(`[search] ${next.fileName}:`, error instanceof Error ? error.message : error);
        await db().update(media).set({ textStatus: "failed" }).where(eq(media.id, next.id));
      }
    }
  } finally {
    running = false;
  }
}

export function kickTextIndex(): void {
  // Tests call processTextIndex directly; the import script leaves the work to the site.
  if (process.env.NODE_ENV === "test" || process.env.PARA_NO_BACKGROUND_JOBS) return;
  void processTextIndex().catch((error: unknown) =>
    console.error("[search] loop failed:", error instanceof Error ? error.message : error),
  );
}

/** Text of a photo (e.g. a printed list of topics); throws ToolUnavailable without tesseract. */
export async function recognizePhoto(bytes: Uint8Array, fileName: string): Promise<string> {
  const detected = detectUpload(bytes, fileName);
  if (detected.kind !== "photo") throw new Error("Это не фото");
  const photo = await heavyJob(() => processPhoto(bytes, detected.format));
  const png = await sharp(photo.full).grayscale().png().toBuffer();
  return cleanText(await heavyJob(() => ocrImage(png, { dropMargins: false })));
}
