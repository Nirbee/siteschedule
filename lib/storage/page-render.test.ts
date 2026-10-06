import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isFaxScan } from "@/lib/ingest/pdf";
import { objectPath, setStorageRootForTesting, writeObject } from "./disk";
import { isPageWidth, mutoolAvailable, pageCacheKey, renderPage } from "./page-render";

// MuPDF is in the Docker image; dev machines may not have it.
const hasMutool = await mutoolAvailable();

describe("scan detection", () => {
  it("spots CCITT/JBIG2 page images", () => {
    expect(isFaxScan(Buffer.from("<< /Filter /CCITTFaxDecode /Width 2480 >>"))).toBe(true);
    expect(isFaxScan(Buffer.from("<< /Filter [/JBIG2Decode] >>"))).toBe(true);
    expect(isFaxScan(Buffer.from("<< /Filter /FlateDecode >> << /Filter /DCTDecode >>"))).toBe(
      false,
    );
  });
});

describe("page rendering", () => {
  it("only allows the fixed widths and caches per source/page/width", () => {
    expect(isPageWidth(1200)).toBe(true);
    expect(isPageWidth(1000)).toBe(false);
    expect(pageCacheKey("files/a.pdf", 3, 1200)).toMatch(
      /^cache\/pages\/[0-9a-f]{16}\/3-1200\.webp$/,
    );
    expect(pageCacheKey("files/a.pdf", 3, 1200)).not.toBe(pageCacheKey("files/b.pdf", 3, 1200));
  });

  it.skipIf(!hasMutool)("renders a PDF page to webp with mutool", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "para-pages-"));
    setStorageRootForTesting(dir);
    try {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595, 842]);
      page.drawText("Page one", {
        x: 50,
        y: 780,
        size: 24,
        font: await doc.embedFont(StandardFonts.Helvetica),
      });
      await writeObject("files/2026-10/book.pdf", await doc.save());
      const key = await renderPage("files/2026-10/book.pdf", 1, 800);
      const meta = await sharp(objectPath(key)).metadata();
      expect(meta).toMatchObject({ format: "webp", width: 800 });
    } finally {
      setStorageRootForTesting(undefined);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
