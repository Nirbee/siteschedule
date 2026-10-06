import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isJunkEntry, listZip, readZipEntry } from "./zip";

/** Builds a ZIP like real archivers do (local headers, central directory, end record). */
function makeZip(files: { name: Buffer; data: Buffer; utf8: boolean; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const body = f.deflate ? deflateRawSync(f.data) : f.data;
    const flags = f.utf8 ? 0x800 : 0;
    const method = f.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(f.data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(f.name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(f.data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(f.name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, f.name, body);
    centrals.push(central, f.name);
    offset += 30 + f.name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe("zip reader", () => {
  const pdf = Buffer.from("%PDF-1.4 лабораторная ".repeat(50));
  const zip = makeZip([
    { name: Buffer.from("ЛР № 1/ROC_lab.pdf"), data: pdf, utf8: true, deflate: true },
    { name: Buffer.from("readme.txt"), data: Buffer.from("plain"), utf8: false, deflate: false },
    // macOS Archive Utility: UTF-8 names without the UTF-8 flag.
    {
      name: Buffer.from("ЛР № 4/Л4a_PCA.pdf"),
      data: Buffer.from("pca"),
      utf8: false,
      deflate: false,
    },
    // Windows archivers store Cyrillic names in CP866 without the UTF-8 flag: «Отчёт.docx».
    {
      name: Buffer.concat([Buffer.from([0x8e, 0xe2, 0xe7, 0xf1, 0xe2]), Buffer.from(".docx")]),
      data: Buffer.from("doc"),
      utf8: false,
      deflate: false,
    },
    {
      name: Buffer.from("__MACOSX/._ROC_lab.pdf"),
      data: Buffer.from("x"),
      utf8: false,
      deflate: false,
    },
  ]);

  it("lists entries with UTF-8 and CP866 names", () => {
    const entries = listZip(zip);
    expect(entries.map((e) => e.name)).toEqual([
      "ЛР № 1/ROC_lab.pdf",
      "readme.txt",
      "ЛР № 4/Л4a_PCA.pdf",
      "Отчёт.docx",
      "__MACOSX/._ROC_lab.pdf",
    ]);
    expect(entries.filter((e) => !isJunkEntry(e.name))).toHaveLength(4);
  });

  it("extracts deflated and stored entries", () => {
    const [first, second] = listZip(zip);
    expect(readZipEntry(zip, first!).equals(pdf)).toBe(true);
    expect(readZipEntry(zip, second!).toString()).toBe("plain");
  });

  it("rejects non-zip data", () => {
    expect(() => listZip(Buffer.from("not a zip at all, definitely not"))).toThrow("Not a ZIP");
  });
});

describe("needsViewCopy", () => {
  it("covers Office and DjVu, not PDFs or archives", async () => {
    const { needsViewCopy } = await import("./convert");
    expect(["a.docx", "b.PPTX", "c.xls", "d.odt", "e.rtf", "f.djvu"].every(needsViewCopy)).toBe(
      true,
    );
    expect(["a.pdf", "b.zip", "c.txt", "d.jpg"].some(needsViewCopy)).toBe(false);
  });
});
