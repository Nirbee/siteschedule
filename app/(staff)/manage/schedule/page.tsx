import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/current";
import { todayInMoscow } from "@/lib/schedule/dates";
import { KIND_LABELS, formatRoom } from "@/lib/schedule/format";
import type { LessonKind } from "@/lib/schedule/types";
import { PARITY_LABELS } from "@/lib/schedule/week";
import { listGroups } from "@/lib/services/members";
import {
  listEntries,
  listSubjects,
  listTimeSlots,
  type EntryRow,
} from "@/lib/services/schedule-admin";
import { getCurrentSemester } from "@/lib/services/schedule";
import {
  deleteEntryAction,
  deleteSubjectAction,
  endEntryAction,
  saveEntryAction,
  saveSemesterAction,
  saveSubjectAction,
} from "./actions";

export const metadata: Metadata = { title: "Базовое расписание" };

const WEEKDAYS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
const KINDS = Object.keys(KIND_LABELS) as LessonKind[];

const field =
  "h-11 w-full min-w-0 rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1 text-[13px] font-bold text-ink-2";
const card = "rounded-card border border-line bg-surface p-[14px] md:p-[22px]";

type Subject = Awaited<ReturnType<typeof listSubjects>>[number];
type Slot = Awaited<ReturnType<typeof listTimeSlots>>[number];
type Group = Awaited<ReturnType<typeof listGroups>>[number];

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireRole("starosta", "admin");
  const [params, semester, subjects, entries, slots, groups] = await Promise.all([
    searchParams,
    getCurrentSemester(),
    listSubjects(),
    listEntries(),
    listTimeSlots(),
    listGroups(),
  ]);
  const ctx = { subjects, slots, groups };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader eyebrow="Режим старосты" title="Базовое расписание" />
      <p className="-mt-4 text-ink-2">
        Пары, которые повторяются каждую неделю. Чтобы отменить или перенести конкретную пару,
        используйте <Link href="/manage/changes/new">«Изменить расписание»</Link>.
      </p>

      {params.ok ? (
        <p role="status" className="rounded-[12px] bg-add-bg p-3 font-semibold text-add">
          {params.ok}
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="rounded-[12px] bg-cancel-bg p-3 font-semibold text-cancel">
          {params.error}
        </p>
      ) : null}

      <section id="semester" className={card}>
        <h2 className="mb-3 text-[17px] font-bold">Семестр</h2>
        <form action={saveSemesterAction} className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Название
            <input
              name="title"
              className={field}
              defaultValue={semester?.title ?? "Осень 2026"}
              required
            />
          </label>
          <label className={labelClass}>
            Первая неделя семестра
            <select
              name="firstWeekParity"
              className={field}
              defaultValue={semester?.firstWeekParity ?? "numerator"}
            >
              <option value="numerator">числитель</option>
              <option value="denominator">знаменатель</option>
            </select>
          </label>
          <label className={labelClass}>
            Понедельник первой учебной недели
            <input
              type="date"
              name="startsOn"
              className={`${field} font-mono`}
              defaultValue={semester?.startsOn}
              required
            />
          </label>
          <label className={labelClass}>
            Последний день занятий
            <input
              type="date"
              name="endsOn"
              className={`${field} font-mono`}
              defaultValue={semester?.endsOn}
              required
            />
          </label>
          <button type="submit" className={buttonClass("secondary", "sm:col-span-2")}>
            Сохранить семестр
          </button>
        </form>
        {slots.length ? (
          <p className="mt-3 font-mono text-[13px] text-muted">
            Сетка звонков: {slots.map((s) => `${s.n}) ${s.start}–${s.end}`).join(" · ")}
          </p>
        ) : null}
      </section>

      <section id="subjects" className={card}>
        <h2 className="mb-1 text-[17px] font-bold">Дисциплины</h2>
        <p className="mb-3 text-[14px] text-muted">
          Как ещё называют предмет в чате — по этим словам бот будет раскладывать фото (например,
          ТСиСА, ЗИС).
        </p>
        <div className="flex flex-col gap-2">
          {subjects.map((subject) => (
            <details key={subject.id} className="rounded-[12px] border border-line p-3">
              <summary className="cursor-pointer font-semibold">
                {subject.name}
                {subject.shortName ? (
                  <span className="text-muted"> · {subject.shortName}</span>
                ) : null}
              </summary>
              <SubjectForm subject={subject} />
              <form action={deleteSubjectAction} className="mt-2">
                <input type="hidden" name="id" value={subject.id} />
                <button type="submit" className={buttonClass("danger", "w-full")}>
                  Удалить дисциплину
                </button>
              </form>
            </details>
          ))}
          <details className="rounded-[12px] border border-dashed border-line-strong p-3">
            <summary className="cursor-pointer font-semibold text-accent">
              + Добавить дисциплину
            </summary>
            <SubjectForm />
          </details>
        </div>
      </section>

      <section id="entries" className={card}>
        <h2 className="mb-3 text-[17px] font-bold">Пары по дням</h2>
        {subjects.length === 0 ? (
          <p className="text-muted">Сначала добавьте дисциплины.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <details className="rounded-[12px] border border-dashed border-line-strong p-3">
              <summary className="cursor-pointer font-semibold text-accent">
                + Добавить пару
              </summary>
              <EntryForm ctx={ctx} />
            </details>
            {WEEKDAYS.map((dayName, i) => {
              const dayEntries = entries.filter((e) => e.weekday === i + 1);
              if (dayEntries.length === 0 && i > 5) return null;
              return (
                <div key={dayName}>
                  <h3 className="mb-2 eyebrow">{dayName}</h3>
                  {dayEntries.length === 0 ? (
                    <p className="text-[14px] text-muted">Пар нет</p>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    {dayEntries.map((entry) => (
                      <EntryItem key={entry.id} entry={entry} ctx={ctx} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SubjectForm({ subject }: { subject?: Subject }) {
  return (
    <form action={saveSubjectAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      {subject ? <input type="hidden" name="id" value={subject.id} /> : null}
      <label className={`${labelClass} sm:col-span-2`}>
        Название
        <input
          name="name"
          className={field}
          defaultValue={subject?.name}
          required
          maxLength={200}
        />
      </label>
      <label className={labelClass}>
        Короткое название
        <input
          name="shortName"
          className={field}
          defaultValue={subject?.shortName ?? ""}
          maxLength={40}
        />
      </label>
      <label className={labelClass}>
        Преподаватель
        <input
          name="teacher"
          className={field}
          defaultValue={subject?.teacher ?? ""}
          maxLength={120}
        />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Другие названия (через запятую)
        <input name="aliases" className={field} defaultValue={subject?.aliases.join(", ")} />
      </label>
      <button type="submit" className={buttonClass("secondary", "sm:col-span-2")}>
        Сохранить
      </button>
    </form>
  );
}

function EntryItem({
  entry,
  ctx,
}: {
  entry: EntryRow;
  ctx: { subjects: Subject[]; slots: Slot[]; groups: Group[] };
}) {
  const subject = ctx.subjects.find((s) => s.id === entry.subjectId);
  const slot = ctx.slots.find((s) => s.n === entry.slotN);
  const groupCodes = ctx.groups.filter((g) => entry.groupIds.includes(g.id)).map((g) => g.code);
  const ended = entry.validTo !== null && entry.validTo < todayInMoscow();

  return (
    <details className={`rounded-[12px] border border-line p-3 ${ended ? "opacity-60" : ""}`}>
      <summary className="cursor-pointer">
        <span className="font-mono text-[14px]">
          {entry.slotN} пара{slot ? ` ${slot.start}` : ""}
        </span>{" "}
        · <b>{subject?.shortName ?? subject?.name}</b> · {KIND_LABELS[entry.kind].toLowerCase()}
        {entry.parity !== "any" ? ` · ${PARITY_LABELS[entry.parity]}` : ""}
        {entry.room ? ` · ${formatRoom(entry.room)}` : ""}
        <span className="block text-[13px] text-muted">
          {groupCodes.join(", ")}
          {entry.validFrom ? ` · с ${entry.validFrom}` : ""}
          {entry.validTo ? ` · по ${entry.validTo}` : ""}
        </span>
      </summary>
      <EntryForm ctx={ctx} entry={entry} />
      <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
        <form action={endEntryAction} className="flex gap-2">
          <input type="hidden" name="id" value={entry.id} />
          <input
            type="date"
            name="lastDay"
            aria-label="Последний день пары"
            className={`${field} font-mono`}
            defaultValue={entry.validTo ?? todayInMoscow()}
          />
          <button type="submit" className={buttonClass("secondary", "shrink-0 px-3")}>
            Завершить
          </button>
        </form>
        <form action={deleteEntryAction}>
          <input type="hidden" name="id" value={entry.id} />
          <button type="submit" className={buttonClass("danger", "w-full")}>
            Удалить пару
          </button>
        </form>
      </div>
    </details>
  );
}

function EntryForm({
  ctx,
  entry,
}: {
  ctx: { subjects: Subject[]; slots: Slot[]; groups: Group[] };
  entry?: EntryRow;
}) {
  const groupIds = entry?.groupIds ?? ctx.groups.filter((g) => g.isEnabled).map((g) => g.id);
  return (
    <form action={saveEntryAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <label className={`${labelClass} sm:col-span-2`}>
        Дисциплина
        <select name="subjectId" className={field} defaultValue={entry?.subjectId ?? ""} required>
          <option value="">Выберите…</option>
          {ctx.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        День недели
        <select name="weekday" className={field} defaultValue={entry?.weekday ?? 1}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Пара
        <select name="slotN" className={`${field} font-mono`} defaultValue={entry?.slotN ?? 1}>
          {ctx.slots.map((s) => (
            <option key={s.n} value={s.n}>
              {s.n} · {s.start}–{s.end}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Неделя
        <select name="parity" className={field} defaultValue={entry?.parity ?? "any"}>
          {(["any", "numerator", "denominator"] as const).map((p) => (
            <option key={p} value={p}>
              {PARITY_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Тип
        <select name="kind" className={field} defaultValue={entry?.kind ?? "lecture"}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Аудитория
        <input name="room" className={field} defaultValue={entry?.room ?? ""} maxLength={40} />
      </label>
      <label className={labelClass}>
        Преподаватель (если другой)
        <input
          name="teacher"
          className={field}
          defaultValue={entry?.teacher ?? ""}
          maxLength={120}
        />
      </label>
      <label className={labelClass}>
        Действует с
        <input
          type="date"
          name="validFrom"
          className={`${field} font-mono`}
          defaultValue={entry?.validFrom ?? ""}
        />
      </label>
      <label className={labelClass}>
        Действует по
        <input
          type="date"
          name="validTo"
          className={`${field} font-mono`}
          defaultValue={entry?.validTo ?? ""}
        />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-[13px] font-bold text-ink-2">Группы</legend>
        <div className="flex flex-wrap gap-x-5">
          {ctx.groups.map((g) => (
            <label key={g.id} className="flex min-h-11 items-center gap-2 font-mono">
              <input
                type="checkbox"
                name="groupIds"
                value={g.id}
                defaultChecked={groupIds.includes(g.id)}
                className="size-5 accent-[var(--color-accent-solid)]"
              />
              {g.code}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className={buttonClass("secondary", "sm:col-span-2")}>
        {entry ? "Сохранить пару" : "Добавить пару"}
      </button>
    </form>
  );
}
