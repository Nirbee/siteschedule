"use client";

import { useState } from "react";
import { Check, FileText, Mail } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import {
  adjustmentKey,
  computeGrades,
  itemKey,
  type GradeLesson,
  type GradingConfig,
} from "@/lib/grades/scheme";
import { KIND_LABELS, shortDate } from "@/lib/schedule/format";
import { setMarkAction } from "./actions";

const STATUS = {
  ok: { text: "минимум набран", style: "bg-add-bg text-add" },
  possible: { text: "можно добрать", style: "bg-change-bg text-change" },
  short: { text: "не хватает", style: "bg-cancel-bg text-cancel" },
} as const;

/**
 * The personal tracker: tap lessons you attended, enter points for РК and tasks; totals are
 * recalculated right away and saved in the background.
 */
export function GradeTracker({
  subjectId,
  config,
  lessons,
  initialMarks,
  today,
  teacher,
  extras,
  studentName,
}: {
  subjectId: string;
  config: GradingConfig;
  lessons: GradeLesson[];
  initialMarks: [string, number][];
  today: string;
  teacher: { fullName: string; email: string | null } | null;
  extras: {
    title: string;
    text: string;
    max: number;
    mediaId: string | null;
    fileName: string | null;
  }[];
  studentName: string;
}) {
  const [marks, setMarks] = useState(() => new Map(initialMarks));
  const [error, setError] = useState<string | null>(null);
  const result = computeGrades(config, lessons, marks, today);

  const save = (key: string, value: number | null) => {
    const previous = marks.get(key);
    setMarks((current) => {
      const next = new Map(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
    void setMarkAction(subjectId, key, value).then((r) => {
      if (r.ok) setError(null);
      else {
        setError(r.error);
        setMarks((current) => {
          const next = new Map(current);
          if (previous === undefined) next.delete(key);
          else next.set(key, previous);
          return next;
        });
      }
    });
  };
  const number = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    return raw.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  const percent = Math.min(100, Math.round((result.total / result.max) * 100));
  const needsHelp = result.modules.some((m) => m.status === "short");
  const mailto = teacher?.email
    ? `mailto:${teacher.email}?subject=${encodeURIComponent(`Дополнительное задание — ${studentName}`)}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
        <p className="text-[14px] text-muted">Примерно</p>
        <p className="font-display text-[32px] leading-tight font-bold">
          {result.total} <span className="text-[18px] text-muted">из {result.max}</span>
        </p>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-chip"
          role="progressbar"
          aria-valuenow={result.total}
          aria-valuemax={result.max}
          aria-label="Баллы"
        >
          <div
            className={`h-full rounded-full ${result.passed ? "bg-add" : "bg-accent-solid"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className={`mt-2 font-semibold ${result.passed ? "text-add" : "text-ink-2"}`}>
          {result.passed ? `По этим данным — «${result.grade}»` : `Пока: «${result.grade}»`}
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-[12px] bg-cancel-bg p-3 font-semibold text-cancel">
          Не сохранилось: {error}
        </p>
      ) : null}

      {result.modules.map((m) => {
        const status = STATUS[m.status];
        const until = config.modules[m.index]?.until;
        return (
          <section
            key={m.index}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-[14px] md:p-[22px]"
          >
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[17px] font-bold">{m.title}</h2>
                <p className="text-[14px] text-muted">
                  {until ? `до ${shortDate(until)} · ` : ""}минимум {m.min}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[22px] leading-none font-bold">{m.points}</p>
                <span
                  className={`mt-1 inline-block rounded-badge px-2 py-0.5 text-[12px] font-bold ${status.style}`}
                >
                  {m.missing ? `${status.text} ${m.missing}` : status.text}
                </span>
              </div>
            </header>

            {m.lessons.length ? (
              <div>
                <p className="mb-1.5 text-[13px] font-bold text-ink-2">
                  Был на занятии · {config.attendance?.points} б. за каждое
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {m.lessons.map(({ lesson, key, attended, future }) => (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={future && !attended}
                        aria-pressed={attended}
                        onClick={() => save(key, attended ? null : 1)}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border px-2.5 text-[13px] font-semibold disabled:opacity-40 ${
                          attended
                            ? "border-add bg-add-bg text-add"
                            : "border-line-strong bg-surface text-ink-2"
                        }`}
                      >
                        {attended ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
                        {shortDate(lesson.date)}
                        <span className="font-normal text-muted">
                          {KIND_LABELS[lesson.kind].slice(0, 3).toLowerCase()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {m.items.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {m.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-muted px-3 py-2 text-[14px]"
                  >
                    <span className="font-semibold">{item.title}</span>
                    <span className="flex items-center gap-1.5 text-muted">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={item.max}
                        step="0.5"
                        defaultValue={item.value ?? ""}
                        placeholder="—"
                        aria-label={`${item.title}, баллов из ${item.max}`}
                        onBlur={(e) => {
                          const value = number(e.target.value);
                          if (value !== (item.value ?? null)) save(itemKey(item.key), value);
                        }}
                        className="h-11 w-16 rounded-[8px] border border-line-strong bg-surface px-2 text-center font-mono text-[15px] text-ink"
                      />
                      из {item.max}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            <label className="flex items-center justify-between gap-3 text-[14px] text-ink-2">
              Минус баллы (опоздания, уходы)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                defaultValue={m.adjustment ? -m.adjustment : ""}
                placeholder="0"
                aria-label={`${m.title}: минус баллов`}
                onBlur={(e) => {
                  const value = number(e.target.value);
                  const stored = value ? -Math.abs(value) : null;
                  if (stored !== (m.adjustment || null)) save(adjustmentKey(m.index), stored);
                }}
                className="h-11 w-16 rounded-[8px] border border-line-strong bg-surface px-2 text-center font-mono text-[15px] text-ink"
              />
            </label>
          </section>
        );
      })}

      {needsHelp ? (
        <section className="flex flex-col gap-3 rounded-card border-2 border-cancel bg-surface p-[14px] md:p-[22px]">
          <h2 className="text-[17px] font-bold">Как добрать баллы</h2>
          {extras.length ? (
            <ul className="flex flex-col gap-2">
              {extras.map((x, i) => (
                <li key={i} className="rounded-[12px] bg-surface-muted p-3 text-[14px]">
                  <p className="font-bold">
                    {x.title} <span className="font-normal text-muted">· до {x.max} б.</span>
                  </p>
                  {x.text ? <p className="mt-1 whitespace-pre-line text-ink-2">{x.text}</p> : null}
                  {x.mediaId ? (
                    <a
                      href={`/view/${x.mediaId}`}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 font-semibold"
                    >
                      <FileText size={16} aria-hidden /> {x.fileName ?? "Задание"}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-2">
              Старосты пока не добавили доп. задания — спросите у них или у преподавателя.
            </p>
          )}
          {mailto ? (
            <a href={mailto} className={buttonClass("primary", "w-full")}>
              <Mail size={18} aria-hidden /> Отправить работу: {teacher!.fullName}
            </a>
          ) : teacher ? (
            <p className="text-[14px] text-muted">Почту {teacher.fullName} пока не добавили.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
