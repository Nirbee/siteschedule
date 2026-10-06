import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { LibraryItem } from "@/lib/services/library";
import { extensionOf } from "@/lib/ingest/detect";
import { formatRelativeDay } from "@/lib/time";
import { displayName, fileTypeLabel, formatBytes } from "./format";
import { ItemActions } from "./item-actions";

const ICONS: Record<string, LucideIcon> = {
  ppt: Presentation,
  pptx: Presentation,
  odp: Presentation,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  ods: FileSpreadsheet,
  csv: FileSpreadsheet,
  zip: FileArchive,
  rar: FileArchive,
  "7z": FileArchive,
  djvu: BookOpen,
};

/** A document: opens in the browser (PDF) or downloads; meta line with type, size, pages, author. */
export function FileRow({ item, canEdit }: { item: LibraryItem; canEdit: boolean }) {
  const Icon = ICONS[extensionOf(item.fileName)] ?? FileText;
  const meta = [
    fileTypeLabel(item.fileName),
    formatBytes(item.sizeBytes),
    item.pageCount ? `${item.pageCount} стр.` : null,
    item.uploaderName,
    formatRelativeDay(item.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line bg-surface p-2.5 pl-3">
      <Icon size={22} strokeWidth={1.8} className="shrink-0 text-accent" aria-hidden />
      <Link href={`/view/${item.id}` as Route} className="min-w-0 flex-1 text-ink no-underline">
        <span className="line-clamp-2 font-semibold break-words">{displayName(item)}</span>
        <span className="block truncate text-[13px] text-muted">{meta}</span>
      </Link>
      {canEdit ? <ItemActions id={item.id} title={item.title} kind="file" /> : null}
    </div>
  );
}
