import { describe, expect, it } from "vitest";
import { contentDisposition } from "./serve";

describe("contentDisposition", () => {
  it("keeps Cyrillic names via filename*", () => {
    expect(contentDisposition("attachment", "Лекция 1.pdf")).toBe(
      `attachment; filename="______ 1.pdf"; filename*=UTF-8''%D0%9B%D0%B5%D0%BA%D1%86%D0%B8%D1%8F%201.pdf`,
    );
  });
});

describe("parseRange", () => {
  it("handles the ranges PDF viewers send", async () => {
    const { parseRange } = await import("./serve");
    expect(parseRange("bytes=0-65535", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=1000-", 1000)).toBe("invalid");
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull(); // multipart ranges: send the whole file
  });
});

describe("serveObject", () => {
  it("answers Range requests with 206 and the exact bytes", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { setStorageRootForTesting, writeObject } = await import("./disk");
    const { serveObject } = await import("./serve");
    const dir = await mkdtemp(path.join(tmpdir(), "para-serve-"));
    setStorageRootForTesting(dir);
    try {
      const data = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
      await writeObject("files/2026-10/book.pdf", data);

      const full = await serveObject("files/2026-10/book.pdf", { mime: "application/pdf" });
      expect(full.status).toBe(200);
      expect(full.headers.get("accept-ranges")).toBe("bytes");
      expect(Buffer.from(await full.arrayBuffer()).equals(data)).toBe(true);

      const part = await serveObject("files/2026-10/book.pdf", {
        mime: "application/pdf",
        rangeHeader: "bytes=100-199",
      });
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe("bytes 100-199/1000");
      expect(Buffer.from(await part.arrayBuffer()).equals(data.subarray(100, 200))).toBe(true);

      const bad = await serveObject("files/2026-10/book.pdf", {
        mime: "application/pdf",
        rangeHeader: "bytes=5000-",
      });
      expect(bad.status).toBe(416);
    } finally {
      setStorageRootForTesting(undefined);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
