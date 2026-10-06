import { extensionOf } from "@/lib/ingest/detect";

/** «3,2 МБ», «840 КБ» */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

/** «PDF», «DOCX» … for the file badge. */
export function fileTypeLabel(fileName: string): string {
  return extensionOf(fileName).toUpperCase() || "ФАЙЛ";
}

/** What people see: the given title, otherwise the file name without extension and underscores. */
export function displayName(item: { title: string | null; fileName: string }): string {
  return (
    item.title ??
    item.fileName
      .replace(/\.[^.]+$/, "")
      .replace(/_+/g, " ")
      .trim()
  );
}
