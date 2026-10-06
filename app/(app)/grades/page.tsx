import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronRight, Settings2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isStaff, requireMember } from "@/lib/auth/current";
import { gradedSubjects, myGrades } from "@/lib/services/grades";

export const metadata: Metadata = { title: "Успеваемость" };

export default async function GradesPage() {
  const { user } = await requireMember();
  const subjects = await gradedSubjects();
  const results = await Promise.all(subjects.map((s) => myGrades(user, s.id)));
  const staff = isStaff(user.role);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Баллы и автомат" title="Успеваемость" />
        {staff ? (
          <Link href="/manage/grades" className={buttonClass("secondary", "mb-6 px-4")}>
            <Settings2 size={18} aria-hidden /> Системы баллов
          </Link>
        ) : null}
      </div>
      <p className="-mt-3 max-w-2xl text-[14px] text-muted">
        Отмечайте свои посещения и баллы за контрольные — сайт посчитает, хватает ли на автомат. Это
        примерный подсчёт для себя: у преподавателя итог может отличаться.
      </p>
      {subjects.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
          Старосты ещё не добавили системы баллов по дисциплинам.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {subjects.map((s, i) => {
            const r = results[i]?.result;
            const short = r?.modules.filter((m) => m.status === "short").length ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/grades/${s.id}` as Route}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-[14px] text-ink no-underline hover:bg-surface-muted md:p-[18px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug font-bold">{s.name}</span>
                    {r ? (
                      <span className="mt-1 block text-[14px] text-ink-2">
                        ~{r.total} из {r.max} ·{" "}
                        {short ? (
                          <span className="font-semibold text-cancel">
                            не хватает в {short} модул{short === 1 ? "е" : "ях"}
                          </span>
                        ) : (
                          r.grade
                        )}
                      </span>
                    ) : null}
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
