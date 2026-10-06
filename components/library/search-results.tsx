import type { Route } from "next";
import Link from "next/link";
import { FileText, Image as ImageIcon } from "lucide-react";
import { displayName, fileTypeLabel } from "@/components/library/format";
import { plural, shortDate } from "@/lib/schedule/format";
import { snippetParts, type SearchResponse, type SearchResult } from "@/lib/services/search";

const viewHref = (id: string, page?: number) =>
  `/view/${id}${page && page > 1 ? `?page=${page}` : ""}` as Route;

/** Search results on /library: files with the pages where the words occur. */
export function SearchResults({ q, response }: { q: string; response: SearchResponse }) {
  const { results, indexing } = response;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-muted">
        {results.length
          ? `Нашлось в ${plural(results.length, "файле", "файлах", "файлах")} по запросу «${q}»`
          : q.length < 2
            ? "Введите хотя бы два символа."
            : `По запросу «${q}» ничего не нашлось.`}
      </p>
      {indexing > 0 ? (
        <p className="rounded-field bg-chip px-3 py-2 text-[14px] text-ink-2">
          Ещё распознаём текст в {plural(indexing, "файле", "файлах", "файлах")} — результаты будут
          полнее чуть позже.
        </p>
      ) : null}
      {results.map((result) => (
        <ResultCard key={result.id} result={result} />
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: SearchResult }) {
  const where = [
    result.subjectName,
    result.lessonDate
      ? `${shortDate(result.lessonDate)}${result.lessonTitle ? ` · ${result.lessonTitle}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const isPhoto = result.kind === "photo";
  const paged = !isPhoto && (result.pageCount ?? 0) > 1;

  return (
    <article className="rounded-card border border-line bg-surface">
      <Link
        href={viewHref(result.id, result.hits[0]?.page)}
        className="flex min-h-[56px] items-center gap-3 p-[14px] pb-2 text-ink no-underline"
      >
        {isPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, session-checked URLs
          <img
            src={`/media/${result.id}/preview`}
            alt=""
            className="size-11 shrink-0 rounded-[8px] object-cover"
          />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[8px] bg-chip font-mono text-[11px] font-bold text-ink-2">
            {fileTypeLabel(result.fileName)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-bold">
            {isPhoto && !result.title ? "Фото" : displayName(result)}
          </span>
          {where ? <span className="block text-[13px] text-muted">{where}</span> : null}
        </span>
      </Link>
      {result.hits.length ? (
        <ul className="flex flex-col pb-2">
          {result.hits.map((hit) => (
            <li key={hit.page}>
              <Link
                href={viewHref(result.id, hit.page)}
                className="flex gap-3 px-[14px] py-2 text-[14px] leading-relaxed text-ink-2 no-underline hover:bg-surface-muted"
              >
                <span className="flex w-11 shrink-0 items-start justify-center pt-0.5 font-mono text-[12px] text-muted">
                  {paged ? (
                    `с. ${hit.page}`
                  ) : isPhoto ? (
                    <ImageIcon size={16} aria-hidden />
                  ) : (
                    <FileText size={16} aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {snippetParts(hit.snippet).map((part, i) =>
                    part.hit ? (
                      <mark
                        key={i}
                        className="rounded-[3px] bg-change-bg px-0.5 font-semibold text-ink"
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-[14px] pb-3 text-[13px] text-muted">Совпадение в названии</p>
      )}
    </article>
  );
}
