import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UploadSheet } from "@/components/library/upload-sheet";
import { PageHeader } from "@/components/ui/page-header";
import { requireMember } from "@/lib/auth/current";
import { plural } from "@/lib/schedule/format";
import { getUploadOptions, listSubjectsWithCounts } from "@/lib/services/library";

export const metadata: Metadata = { title: "Конспекты" };

export default async function LibraryPage() {
  const { user } = await requireMember();
  const [subjects, upload] = await Promise.all([
    listSubjectsWithCounts(),
    getUploadOptions(user.groupId!),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Библиотека" title="Конспекты" />
        <div className="mb-6">
          <UploadSheet {...upload} />
        </div>
      </div>

      {subjects.length === 0 ? (
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
