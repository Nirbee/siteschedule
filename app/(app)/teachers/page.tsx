import type { Metadata, Route } from "next";
import Link from "next/link";
import { Mail, Pencil, Plus, UserRound } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isStaff, requireMember } from "@/lib/auth/current";
import { listTeachers } from "@/lib/services/teachers";

export const metadata: Metadata = { title: "Преподаватели" };

export default async function TeachersPage() {
  const { user } = await requireMember();
  const teachers = await listTeachers();
  const staff = isStaff(user.role);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Связь" title="Преподаватели" />
        {staff ? (
          <Link href="/manage/teachers/new" className={buttonClass("secondary", "mb-6 px-4")}>
            <Plus size={18} aria-hidden /> Преподаватель
          </Link>
        ) : null}
      </div>
      {teachers.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
          Старосты скоро добавят преподавателей и их почту для связи.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teachers.map((t) => (
            <li
              key={t.id}
              id={`t-${t.id}`}
              className="flex scroll-mt-20 flex-col gap-3 rounded-card border border-line bg-surface p-[14px] md:p-[18px]"
            >
              <div className="flex items-start gap-3">
                {t.hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, session-checked
                  <img
                    src={`/teachers/${t.id}/photo`}
                    alt=""
                    className="size-16 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-chip text-muted">
                    <UserRound size={28} aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="leading-snug font-bold">{t.fullName}</h2>
                  {t.subjects.length ? (
                    <p className="text-[14px] text-ink-2">
                      {t.subjects.map((s) => s.name).join(", ")}
                    </p>
                  ) : null}
                </div>
                {staff ? (
                  <Link
                    href={`/manage/teachers/${t.id}` as Route}
                    aria-label={`Изменить: ${t.fullName}`}
                    className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chip"
                  >
                    <Pencil size={18} aria-hidden />
                  </Link>
                ) : null}
              </div>
              {t.note ? (
                <p className="rounded-[10px] bg-surface-muted px-3 py-2 text-[14px] text-ink-2">
                  {t.note}
                </p>
              ) : null}
              {t.email ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`mailto:${t.email}`}
                    className={buttonClass("secondary", "h-11 min-w-0 flex-1 px-3 text-[14px]")}
                  >
                    <Mail size={17} aria-hidden />
                    <span className="truncate">{t.email}</span>
                  </a>
                  <CopyButton text={t.email} label="Скопировать почту" />
                </div>
              ) : (
                <p className="text-[14px] text-muted">Почту для связи пока не добавили.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
