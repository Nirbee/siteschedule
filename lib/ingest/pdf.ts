// Page count for PDFs. Titles from PDF metadata are deliberately NOT used: on real course files
// they are mostly wrong («Московский Государственный Технический Университет», «PowerPoint
// Presentation», «1.djvu»…). People rename files by hand instead.
import { PDFDocument } from "pdf-lib";

export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null; // broken or unusual PDF — still stored, just without a page count
  }
}
