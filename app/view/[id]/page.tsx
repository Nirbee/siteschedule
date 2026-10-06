import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import { ArrowLeft, Download, FileText, Folder } from "lucide-react";
import { displayName, formatBytes } from "@/components/library/format";
import { PageImagesViewer } from "@/components/viewer/page-images-viewer";
import { PdfViewer } from "@/components/viewer/pdf-viewer";
import { Preparing } from "@/components/viewer/preparing";
import { requireMember } from "@/lib/auth/current";
import { needsViewCopy } from "@/lib/ingest/convert";
import { extensionOf } from "@/lib/ingest/detect";
import { decodeText, parseCsv } from "@/lib/ingest/text";
import { isJunkEntry, listZip, readZipEntry, type ZipEntry } from "@/lib/ingest/zip";
import { getServableMedia, getSubject, pdfViewInfo } from "@/lib/services/library";
import { objectPath } from "@/lib/storage/disk";
import { mutoolAvailable } from "@/lib/storage/page-render";

type Params = { id: string };
type Search = { entry?: string; page?: string };

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

async function load(id: string, viewer?: Parameters<typeof getServableMedia>[1]) {
  return /^[0-9a-f-]{36}$/.test(id) ? getServableMedia(id, viewer) : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const item = await load((await params).id);
  return { title: item ? displayName(item) : "Просмотр" };
}

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { user } = await requireMember();
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const item = await load(id, user);
  if (!item) notFound();
  const page = Number(search.page);
  const initialPage = Number.isInteger(page) && page > 1 ? page : undefined;
  const subject = item.subjectId ? await getSubject(item.subjectId) : undefined;
  const ext = extensionOf(item.fileName);
  const back = (
    item.status === "unsorted"
      ? "/manage/inbox"
      : subject
        ? `/library/${subject.id}${item.lessonNoteId ? `#note-${item.lessonNoteId}` : "?tab=materials"}`
        : "/library"
  ) as Route;

  let body: React.ReactNode;
  let headerTitle = displayName(item);
  let subtitle = [
    subject?.shortName ?? subject?.name,
    ext.toUpperCase(),
    formatBytes(item.sizeBytes),
  ]
    .filter(Boolean)
    .join(" · ");
  let downloadHref = `/media/${item.id}?download=1`;

  if (item.kind === "photo") {
    body = (
      <div className="flex flex-1 items-center justify-center overflow-auto p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked URLs */}
        <img src={`/media/${item.id}`} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    );
  } else if (ext === "pdf") {
    body = await documentViewer(item, "original", initialPage);
  } else if (needsViewCopy(item.fileName)) {
    body =
      item.viewStatus === "ready" ? (
        await documentViewer(item, "copy", initialPage)
      ) : item.viewStatus === "pending" ? (
        <Preparing />
      ) : (
        <NotViewable text="Этот файл не получилось показать на сайте — его можно скачать." />
      );
  } else if (ext === "txt" || ext === "csv") {
    body =
      item.sizeBytes > MAX_TEXT_BYTES ? (
        <NotViewable text="Файл слишком большой для просмотра на сайте." />
      ) : (
        <TextBody
          text={decodeText(await readFile(objectPath(item.storageKey)))}
          csv={ext === "csv"}
        />
      );
  } else if (ext === "zip") {
    const zip = await readFile(objectPath(item.storageKey));
    let entries: ZipEntry[] = [];
    try {
      entries = listZip(zip).filter((e) => !e.isDirectory && !isJunkEntry(e.name));
    } catch {
      body = <NotViewable text="Архив повреждён или в нём неподдерживаемый формат." />;
    }
    const selected =
      search.entry !== undefined
        ? entries.find((e) => e.index === Number(search.entry))
        : undefined;
    if (body) {
      // broken archive — message already set
    } else if (selected) {
      const name = selected.name.split("/").pop() ?? selected.name;
      const entryExt = extensionOf(name);
      const entryUrl = `/media/${item.id}/archive?entry=${selected.index}`;
      headerTitle = name;
      subtitle = `из архива «${displayName(item)}» · ${formatBytes(selected.size)}`;
      downloadHref = entryUrl;
      body =
        entryExt === "pdf" ? (
          <PdfViewer url={entryUrl} />
        ) : IMAGE_EXT.has(entryExt) ? (
          <div className="flex flex-1 items-center justify-center overflow-auto p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked URLs */}
            <img src={entryUrl} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        ) : entryExt === "txt" && selected.size <= MAX_TEXT_BYTES ? (
          <TextBody text={decodeText(readZipEntry(zip, selected))} csv={false} />
        ) : (
          <NotViewable text="Этот файл из архива можно только скачать." />
        );
    } else {
      body = <ArchiveList itemId={item.id} entries={entries} />;
    }
  } else {
    body = <NotViewable text="Архивы RAR и 7Z пока можно только скачать." />;
  }

  return (
    <div className="flex h-dvh flex-col bg-viewer text-on-viewer">
      <header className="flex shrink-0 items-center gap-2 border-b border-on-viewer/10 px-2 py-1.5 pt-[max(6px,env(safe-area-inset-top))]">
        <Link
          href={search.entry !== undefined ? (`/view/${item.id}` as Route) : back}
          aria-label="Назад"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-on-viewer hover:bg-on-viewer/10"
        >
          <ArrowLeft size={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold">{headerTitle}</h1>
          <p className="truncate text-[12px] opacity-70">{subtitle}</p>
        </div>
        <a
          href={downloadHref}
          aria-label="Скачать"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-on-viewer hover:bg-on-viewer/10"
        >
          <Download size={20} />
        </a>
      </header>
      {body}
    </div>
  );
}

/** Scans pdf.js can't handle are shown as server-rendered pages (when MuPDF is installed). */
async function documentViewer(
  item: NonNullable<Awaited<ReturnType<typeof getServableMedia>>>,
  source: "original" | "copy",
  initialPage: number | undefined,
) {
  const info = await pdfViewInfo(item, source);
  if (info.serverPages && info.pageCount && (await mutoolAvailable())) {
    return (
      <PageImagesViewer
        mediaId={item.id}
        fromViewCopy={source === "copy"}
        pageCount={info.pageCount}
        initialPage={initialPage}
      />
    );
  }
  return (
    <PdfViewer
      url={source === "copy" ? `/media/${item.id}/view` : `/media/${item.id}`}
      initialPage={initialPage}
    />
  );
}

function NotViewable({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="max-w-sm opacity-80">{text}</p>
    </div>
  );
}

function TextBody({ text, csv }: { text: string; csv: boolean }) {
  if (csv) {
    const rows = parseCsv(text);
    return (
      <div className="flex-1 overflow-auto bg-paper p-3 text-[14px] text-on-paper">
        <table className="border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 ? "font-bold" : undefined}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="border border-paper-line px-2 py-1 align-top whitespace-pre-wrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <pre className="flex-1 overflow-auto bg-paper p-4 font-mono text-[14px] leading-relaxed whitespace-pre-wrap text-on-paper">
      {text}
    </pre>
  );
}

function ArchiveList({ itemId, entries }: { itemId: string; entries: ZipEntry[] }) {
  // Group by folder, keep the archive's order.
  const folders = new Map<string, ZipEntry[]>();
  for (const e of entries) {
    const folder = e.name.includes("/") ? e.name.slice(0, e.name.lastIndexOf("/")) : "";
    folders.set(folder, [...(folders.get(folder) ?? []), e]);
  }
  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {[...folders].map(([folder, files]) => (
          <section key={folder}>
            {folder ? (
              <h2 className="mb-1.5 flex items-center gap-2 text-[14px] font-bold opacity-80">
                <Folder size={16} aria-hidden /> {folder.split("/").pop()}
              </h2>
            ) : null}
            <ul className="flex flex-col gap-1">
              {files.map((e) => (
                <li key={e.index}>
                  <Link
                    href={`/view/${itemId}?entry=${e.index}` as Route}
                    className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-on-viewer no-underline hover:bg-on-viewer/10"
                  >
                    <FileText size={18} className="shrink-0 opacity-70" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{e.name.split("/").pop()}</span>
                    <span className="shrink-0 text-[12px] opacity-60">{formatBytes(e.size)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
