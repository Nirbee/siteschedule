import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, Settings2, Users } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { isStaff, requireMember } from "@/lib/auth/current";
import { todayInMoscow } from "@/lib/schedule/dates";
import { gradesOverview, getScheme, trackerData } from "@/lib/services/grades";
import { getSubject } from "@/lib/services/library";
import { GradeTracker } from "../grade-tracker";

export const metadata: Metadata = { title: "Успеваемость" };

export default async function SubjectGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ user }, { subjectId }, search] = await Promise.all([
    requireMember(),
    params,
    searchParams,
  ]);
  const subject = /^[0-9a-f-]{36}$/.test(subjectId) ? await getSubject(subjectId) : undefined;
  const config = subject ? await getScheme(subject.id) : null;
  if (!subject || !config) notFound();
  const staff = isStaff(user.role);
  const overview = staff && search.view === "all";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link
          href="/grades"
          className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          <ArrowLeft size={16} aria-hidden /> Успеваемость
        </Link>
        <p className="mb-1 eyebrow">{overview ? "Сводка по группе" : "Мои баллы"}</p>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
          {subject.name}
        </h1>
      </div>
      <p className="flex gap-2 rounded-[12px] bg-surface-muted p-3 text-[14px] text-ink-2">
        <Info size={18} className="mt-px shrink-0 text-muted" aria-hidden />
        Это примерный подсчёт для себя по тому, что вы отметили. У преподавателя итог может
        отличаться.
      </p>
      {config.note ? (
        <p className="rounded-[12px] border border-line p-3 text-[14px] whitespace-pre-line text-ink-2">
          {config.note}
        </p>
      ) : null}
      {staff ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={(overview ? `/grades/${subject.id}` : `/grades/${subject.id}?view=all`) as Route}
            className={buttonClass("secondary")}
          >
            <Users size={18} aria-hidden /> {overview ? "Мои баллы" : "Сводка по всем"}
          </Link>
          <Link href={`/manage/grades/${subject.id}` as Route} className={buttonClass("secondary")}>
            <Settings2 size={18} aria-hidden /> Система баллов
          </Link>
        </div>
      ) : null}
      {overview ? (
        <Overview subjectId={subject.id} actor={user} />
      ) : (
        <Tracker subjectId={subject.id} user={user} />
      )}
    </div>
  );
}

async function Tracker({
  subjectId,
  user,
}: {
  subjectId: string;
  user: Awaited<ReturnType<typeof requireMember>>["user"];
}) {
  const data = await trackerData(user, subjectId);
  if (!data) return null;
  return (
    <GradeTracker
      subjectId={subjectId}
      config={data.config}
      lessons={data.lessons}
      initialMarks={data.marks}
      today={todayInMoscow()}
      teacher={data.teacher}
      studentName={user.fullName ?? user.displayName}
      extras={data.extras}
    />
  );
}

const STATUS_STYLE = {
  ok: "text-add",
  possible: "text-change",
  short: "font-bold text-cancel",
} as const;

async function Overview({
  subjectId,
  actor,
}: {
  subjectId: string;
  actor: Awaited<ReturnType<typeof requireMember>>["user"];
}) {
  const rows = await gradesOverview(actor, subjectId);
  const filled = rows.filter((r) => r.filled).length;
  return (
    <section className="flex flex-col gap-2">
      <p className="text-[14px] text-muted">
        Заполнили: {filled} из {rows.length}. Сверху — у кого по их отметкам не набирается минимум
        модуля.
      </p>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[480px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th className="px-3 py-2 font-semibold">Студент</th>
              {rows[0]?.modules.map((_, i) => (
                <th key={i} className="px-2 py-2 text-right font-semibold">
                  М{i + 1}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">Всего</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2">
                  {r.name}
                  {r.group ? <span className="font-mono text-muted"> · {r.group}</span> : null}
                </td>
                {r.filled ? (
                  <>
                    {r.modules.map((m, i) => (
                      <td
                        key={i}
                        className={`px-2 py-2 text-right font-mono ${STATUS_STYLE[m.status]}`}
                      >
                        {m.points}/{m.min}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono font-bold">{r.total}</td>
                  </>
                ) : (
                  <td colSpan={r.modules.length + 1} className="px-3 py-2 text-right text-muted">
                    не заполнял(а)
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
