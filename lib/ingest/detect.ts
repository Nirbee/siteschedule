// What kind of upload is this, and is it allowed? Photos are recognised by their bytes,
// documents by extension.

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export type PhotoFormat = "jpeg" | "png" | "webp" | "gif" | "heic";

const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  djvu: "image/vnd.djvu",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
};

export const ACCEPTED_EXTENSIONS = Object.keys(FILE_TYPES);

export type Detected =
  | { kind: "photo"; format: PhotoFormat }
  | { kind: "file"; extension: string; mime: string }
  | { kind: "rejected"; reason: string };

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function photoFormat(bytes: Uint8Array): PhotoFormat | null {
  const b = bytes;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 4) === "GIF8") return "gif";
  if (ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return "heic";
  return null;
}

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(fileName.trim());
  return match ? match[1]!.toLowerCase() : "";
}

export function detectUpload(bytes: Uint8Array, fileName: string): Detected {
  if (bytes.length === 0) return { kind: "rejected", reason: "Пустой файл" };
  const format = photoFormat(bytes);
  if (format) {
    return bytes.length > MAX_PHOTO_BYTES
      ? { kind: "rejected", reason: "Фото больше 15 МБ" }
      : { kind: "photo", format };
  }
  const extension = extensionOf(fileName);
  const mime = FILE_TYPES[extension];
  if (!mime) return { kind: "rejected", reason: "Такой тип файла не поддерживается" };
  if (bytes.length > MAX_FILE_BYTES) return { kind: "rejected", reason: "Файл больше 50 МБ" };
  return { kind: "file", extension, mime };
}

/** Keeps letters (any script), digits, spaces and a few safe symbols; never empty. */
export function safeFileName(fileName: string): string {
  const base = baseName(fileName)
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._()+,=-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-150);
  return base && !/^\.+$/.test(base) ? base : "file";
}

function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}
