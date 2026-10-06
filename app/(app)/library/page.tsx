import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { SearchResults } from "@/components/library/search-results";
import { UploadSheet } from "@/components/library/upload-sheet";
import { PageHeader } from "@/components/ui/page-header";
import { requireMember } from "@/lib/auth/current";
import { plural } from "@/lib/schedule/format";
import { getUploadOptions, listSubjectsWithCounts } from "@/lib/services/library";
import { normalizeQuery, searchLibrary } from "@/lib/services/search";

export const metadata: Metadata = { title: "Конспекты" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ user }, search] = await Promise.all([requireMember(), searchParams]);
  const q = normalizeQuery(search.q ?? "");
  const [subjects, upload, found] = await Promise.all([
    q ? [] : listSubjectsWithCounts(),
    getUploadOptions(user.groupId!),
    q ? searchLibrary(q) : null,
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Библиотека" title="Конспекты" />
        <div className="mb-6">
          <UploadSheet {...upload} />
        </div>
      </div>

      <form
        action="/library"
        role="search"
        className="flex items-center gap-2 rounded-field border border-line-strong bg-surface px-3"
      >
        <Search size={18} className="shrink-0 text-muted" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Найти в конспектах, книгах и фото"
          aria-label="Поиск по тексту файлов"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
        />
        {q ? (
          <Link href="/library" className="shrink-0 px-1 text-[14px] font-semibold">
            Сбросить
          </Link>
        ) : null}
      </form>

      {found ? (
        <SearchResults q={q} response={found} />
      ) : subjects.length === 0 ? (
        <p className="text-muted">Дисциплины появятся, когда староста заполнит расписание.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
          {subjects.map((subject) => {
            const counts = [
              subject.photos ? plural(subject.photos, "фото", "фото", "фото") : null,
              subject.files ? plural(subject.files, "файл", "файла", "файлов") : null,
            ].filter(Boolean);
            return (
              <li key={subject.id}>
                <Link
                  href={`/library/${subject.id}` as Route}
                  className="flex min-h-[72px] items-center gap-3 rounded-card border border-line bg-surface p-[14px] text-ink no-underline hover:bg-surface-muted md:p-[18px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug font-bold">{subject.name}</span>
                    <span className="text-[14px] text-muted">
                      {counts.length ? counts.join(" · ") : "пока пусто"}
                    </span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
