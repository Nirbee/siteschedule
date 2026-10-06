import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenText, Pencil } from "lucide-react";
import { controlTime } from "@/components/tasks/format";
import { MaterialList } from "@/components/tasks/material-list";
import { TaskText } from "@/components/tasks/task-text";
import { buttonClass } from "@/components/ui/button";
import { isStaff, requireMember } from "@/lib/auth/current";
import { todayInMoscow } from "@/lib/schedule/dates";
import { formatRoom, shortDate } from "@/lib/schedule/format";
import { loadScheduleData } from "@/lib/services/schedule";
import { getControlEvent } from "@/lib/services/tasks";
import { untilLabel } from "@/lib/tasks/place";

type Params = { id: string };

async function load(id: string) {
  return /^[0-9a-f-]{36}$/.test(id) ? getControlEvent(id) : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const event = await load((await params).id);
  return { title: event ? `${event.form} · ${event.subjectName}` : "Контрольная" };
}

export default async function ControlEventPage({ params }: { params: Promise<Params> }) {
  const [{ user }, { id }, data] = await Promise.all([requireMember(), params, loadScheduleData()]);
  const event = await load(id);
  if (!event) notFound();

  const today = todayInMoscow();
  const until = untilLabel(today, event.date);
  const when = [
    shortDate(event.date),
    controlTime(event, data?.slots ?? new Map()),
    formatRoom(event.room),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href="/tasks?f=control"
          className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          <ArrowLeft size={16} aria-hidden /> Все контрольные
        </Link>
        <p className="mb-1 eyebrow">{event.form}</p>
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
          {event.subjectName}
        </h1>
        <p className="mt-1.5 font-mono text-[15px] text-ink-2">{when}</p>
        <p
          className={`mt-2 inline-flex rounded-badge px-2 py-0.5 text-[13px] font-bold ${
            event.date < today ? "bg-chip text-muted" : "bg-exam text-exam-bg"
          }`}
        >
          {event.date < today ? `Прошла ${until}` : until === "сегодня" ? "Сегодня" : until}
        </p>
      </div>

      {event.topics ? (
        <Section title="Вопросы и темы">
          <TaskText text={event.topics} className="text-[16px] text-ink" />
        </Section>
      ) : null}
      {event.rules ? (
        <Section title="Можно / нельзя">
          <TaskText text={event.rules} className="text-[16px] text-ink" />
        </Section>
      ) : null}
      {event.admission ? (
        <Section title="Условия допуска">
          <TaskText text={event.admission} className="text-[16px] text-ink" />
        </Section>
      ) : null}

      <Section title="Материалы для подготовки">
        {event.materials.length ? (
          <MaterialList materials={event.materials} variant="rows" />
        ) : (
          <p className="text-muted">Староста пока ничего не прикрепил.</p>
        )}
        <Link
          href={`/library/${event.subjectId}` as Route}
          className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          <BookOpenText size={16} aria-hidden /> Все конспекты и материалы по дисциплине
        </Link>
      </Section>

      {isStaff(user.role) ? (
        <Link
          href={`/manage/tasks/control/${event.id}` as Route}
          className={buttonClass("secondary", "self-start")}
        >
          <Pencil size={18} aria-hidden /> Изменить
        </Link>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
      <h2 className="mb-2.5 eyebrow">{title}</h2>
      {children}
    </section>
  );
}
