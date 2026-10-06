// PDF copies for viewing Office and DjVu files on the site. Runs in the background:
// a file is visible right away, «смотреть на сайте» appears once its copy is ready.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { objectPath, writeObject } from "@/lib/storage/disk";
import { extensionOf } from "./detect";
import { heavyJob } from "./limit";
import { isFaxScan, pdfPageCount } from "./pdf";
import { kickTextIndex } from "./text-index";

const OFFICE = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "ods", "rtf"]);

/** Files that get a PDF copy for viewing. PDFs, text and archives are shown as they are. */
export function needsViewCopy(fileName: string): boolean {
  const ext = extensionOf(fileName);
  return OFFICE.has(ext) || ext === "djvu";
}

/** The converter is not installed here (dev machine) — leave the job for production. */
export class ConverterUnavailable extends Error {}

async function officeToPdf(bytes: Buffer, fileName: string): Promise<Buffer> {
  const base = env().GOTENBERG_URL;
  if (!base) throw new ConverterUnavailable("GOTENBERG_URL is not set");
  const form = new FormData();
  // Gotenberg picks the converter by extension; keep a plain ASCII name.
  form.append("files", new Blob([new Uint8Array(bytes)]), `document.${extensionOf(fileName)}`);
  const response = await fetch(new URL("/forms/libreoffice/convert", base), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Gotenberg ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

async function djvuToPdf(sourcePath: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "para-djvu-"));
  const out = path.join(dir, "out.pdf");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ddjvu", ["-format=pdf", "-quality=60", sourcePath, out], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (error: NodeJS.ErrnoException) =>
        reject(error.code === "ENOENT" ? new ConverterUnavailable("ddjvu not installed") : error),
      );
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ddjvu exited ${code}: ${stderr.slice(0, 300)}`)),
      );
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Creates the PDF copy for one media row. */
export async function createViewCopy(item: typeof media.$inferSelect): Promise<void> {
  const ext = extensionOf(item.fileName);
  const pdf =
    ext === "djvu"
      ? await djvuToPdf(objectPath(item.storageKey))
      : await officeToPdf(await readFile(objectPath(item.storageKey)), item.fileName);
  const key = `${item.storageKey.replace(/\.[^./]+$/, "")}.view.pdf`;
  await writeObject(key, pdf);
  await db()
    .update(media)
    .set({
      viewKey: key,
      viewStatus: "ready",
      // For Office/DjVu files these describe the PDF copy the viewer shows.
      pageCount: await pdfPageCount(pdf),
      serverPages: isFaxScan(pdf),
    })
    .where(eq(media.id, item.id));
}

let running = false;

/** Works through pending copies one by one; safe to call often (only one loop runs). */
export async function processViewCopies(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const [next] = await db()
        .select()
        .from(media)
        .where(and(eq(media.viewStatus, "pending"), isNull(media.deletedAt)))
        .orderBy(asc(media.createdAt))
        .limit(1);
      if (!next) break;
      try {
        await heavyJob(() => createViewCopy(next));
        kickTextIndex(); // the copy is what search reads
      } catch (error) {
        if (error instanceof ConverterUnavailable) break; // try again on a machine that has it
        console.error(
          `[convert] ${next.fileName}:`,
          error instanceof Error ? error.message : error,
        );
        // Leaves the queue; the original is still downloadable.
        await db()
          .update(media)
          .set({ viewStatus: "failed", textStatus: "none" })
          .where(eq(media.id, next.id));
      }
    }
  } finally {
    running = false;
  }
}

/** Fire-and-forget trigger used after uploads and on server start. */
export function kickViewCopies(): void {
  if (process.env.PARA_NO_BACKGROUND_JOBS) return; // the import script: the site does it
  void processViewCopies().catch((error: unknown) =>
    console.error("[convert] loop failed:", error instanceof Error ? error.message : error),
  );
}
