// Minimal ZIP reader (no dependency): list entries and extract one, for viewing archives on
// the site. Supports stored and deflated entries, UTF-8 and Windows (CP866) file names.
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  index: number;
  name: string; // full path inside the archive
  size: number;
  compressedSize: number;
  method: number;
  localOffset: number;
  isDirectory: boolean;
}

/** Entries bigger than this are not extracted for viewing (zip-bomb guard). */
export const MAX_ENTRY_BYTES = 60 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function decodeName(bytes: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return bytes.toString("utf8");
  // macOS writes UTF-8 names without setting the flag; Russian Windows archivers write CP866.
  // CP866 Cyrillic almost never forms valid UTF-8, so «valid UTF-8» is a reliable test.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("ibm866").decode(bytes);
  }
}

/** System junk added by macOS/Windows archivers. */
export function isJunkEntry(name: string): boolean {
  return (
    /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i.test(name) ||
    /(^|\/)\._/.test(name)
  );
}

export function listZip(buf: Buffer): ZipEntry[] {
  // End of central directory: last 22..65557 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP archive");
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("Broken ZIP directory");
    const flags = buf.readUInt16LE(offset + 8);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const name = decodeName(
      buf.subarray(offset + 46, offset + 46 + nameLength),
      (flags & 0x800) !== 0,
    );
    entries.push({
      index,
      name,
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      size: buf.readUInt32LE(offset + 24),
      localOffset: buf.readUInt32LE(offset + 42),
      isDirectory: name.endsWith("/"),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  if (entry.isDirectory) throw new Error("Entry is a directory");
  if (entry.size > MAX_ENTRY_BYTES) throw new Error("Entry is too large to view");
  const at = entry.localOffset;
  if (buf.readUInt32LE(at) !== LOCAL_SIGNATURE) throw new Error("Broken ZIP entry");
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  throw new Error(`Unsupported compression method ${entry.method}`);
}
