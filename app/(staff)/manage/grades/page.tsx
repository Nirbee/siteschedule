import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { gradedSubjects } from "@/lib/services/grades";
import { listSubjects } from "@/lib/services/schedule-admin";

export const metadata: Metadata = { title: "Системы баллов" };

export default async function ManageGradesPage() {
  await requireRole("starosta", "admin");
  const [subjects, graded] = await Promise.all([listSubjects(), gradedSubjects()]);
  const has = new Set(graded.map((s) => s.id));
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Режим старосты" title="Системы баллов" />
      <p className="-mt-3 mb-4 text-[14px] text-muted">
        У каждого преподавателя свои правила. Где система задана, студенты видят дисциплину в
        «Успеваемости» и отмечают свои баллы.
      </p>
      <ul className="flex flex-col gap-2">
        {subjects
          .filter((s) => s.name !== "Самостоятельная работа")
          .map((s) => (
            <li key={s.id}>
              <Link
                href={`/manage/grades/${s.id}` as Route}
                className="flex min-h-[56px] items-center gap-3 rounded-card border border-line bg-surface px-[14px] py-2.5 text-ink no-underline hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1 font-semibold">{s.name}</span>
                <span
                  className={`rounded-badge px-2 py-0.5 text-[12px] font-bold ${
                    has.has(s.id) ? "bg-add-bg text-add" : "bg-chip text-muted"
                  }`}
                >
                  {has.has(s.id) ? "задана" : "нет"}
                </span>
                <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
