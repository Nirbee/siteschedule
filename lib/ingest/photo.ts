// Photo pipeline: orientation, no metadata (EXIF/GPS), ≤2560px webp + 480px preview.
import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";
import type { PhotoFormat } from "./detect";

export const FULL_SIZE = 2560;
export const PREVIEW_WIDTH = 480;

export interface ProcessedPhoto {
  full: Buffer;
  preview: Buffer;
  width: number;
  height: number;
}

async function open(bytes: Uint8Array, format: PhotoFormat): Promise<Sharp> {
  if (format === "heic") {
    // sharp's prebuilt libvips cannot read HEVC-based HEIC (iPhone); decode it in WebAssembly.
    // libheif applies the stored rotation itself.
    const image = await decodeHeic({ buffer: Buffer.from(bytes) });
    const pixels = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    return sharp(pixels, {
      raw: { width: image.width, height: image.height, channels: 4 },
    });
  }
  // .rotate() bakes in the EXIF orientation; sharp drops all metadata unless asked to keep it.
  return sharp(bytes, { failOn: "none", animated: false }).rotate();
}

export async function processPhoto(
  bytes: Uint8Array,
  format: PhotoFormat,
): Promise<ProcessedPhoto> {
  const image = await open(bytes, format);
  const { data: full, info } = await image
    .clone()
    .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const preview = await image
    .clone()
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
  return { full, preview, width: info.width, height: info.height };
}
