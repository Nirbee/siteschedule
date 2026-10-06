"use client";

import { useState, useTransition } from "react";
import { Check, FileText, Maximize2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { shortDate } from "@/lib/schedule/format";
import { deleteItemsAction, sortItemsAction } from "./actions";

export interface LessonChoice {
  value: string; // JSON of the sort target
  subjectId: string;
  date: string;
  slotN: number | null;
  label: string;
}

export interface BoardBatch {
  day: string;
  time: string;
  author: string | null;
  caption: string | null;
  hint: {
    subjectId: string;
    subjectName: string;
    date: string | null;
    slotN: number | null;
  } | null;
  reason: string | null;
  items: { id: string; kind: "photo" | "file"; name: string }[];
}

const field =
  "h-11 w-full min-w-0 rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";

export function InboxBoard({
  batches,
  lessons,
  subjects,
  mode,
}: {
  batches: BoardBatch[];
  lessons: LessonChoice[];
  subjects: { id: string; name: string }[];
  mode: "unsorted" | "auto";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lesson, setLesson] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (ids: string[], on?: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      const add = on ?? !ids.every((id) => next.has(id));
      for (const id of ids) {
        if (add) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const lessonFor = (hint: BoardBatch["hint"]) =>
    hint?.date
      ? lessons.find(
          (l) => l.subjectId === hint.subjectId && l.date === hint.date && l.slotN === hint.slotN,
        )
      : undefined;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await work();
      if (result.ok) {
        setSelected(new Set());
        setError(null);
      } else setError(result.error ?? "Не получилось");
    });

  // The first selected item's hint preselects the lesson.
  const firstHint = batches.find((b) => b.items.some((i) => selected.has(i.id)))?.hint ?? null;
  const lessonValue = lesson || lessonFor(firstHint)?.value || "";
  const subjectValue = subject || firstHint?.subjectId || "";

  const newDay = batches.map((b, i) => i === 0 || batches[i - 1]!.day !== b.day);
  return (
    <>
      <div className="flex flex-col gap-4">
        {batches.map((batch, b) => {
          const ids = batch.items.map((i) => i.id);
          const allOn = ids.every((id) => selected.has(id));
          const hinted = mode === "unsorted" ? lessonFor(batch.hint) : undefined;
          const dayHeader = newDay[b] ? batch.day : null;
          return (
            <section key={b} className="flex flex-col gap-2">
              {dayHeader ? <h2 className="mt-2 eyebrow">{shortDate(dayHeader)}</h2> : null}
              <div className="rounded-card border border-line bg-surface p-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-[14px]">
                    <p className="font-semibold">
                      <span className="font-mono text-muted">{batch.time}</span>{" "}
                      {batch.author ?? "Без автора"} · {batch.items.length} шт.
                    </p>
                    {batch.caption ? (
                      <p className="line-clamp-2 text-ink-2">«{batch.caption}»</p>
                    ) : null}
                    {batch.hint ? (
                      <p className="text-muted">
                        {mode === "auto" ? "Разложено: " : "Похоже: "}
                        {batch.hint.subjectName}
                        {batch.hint.date
                          ? `, ${shortDate(batch.hint.date)}${batch.hint.slotN ? ` · ${batch.hint.slotN} пара` : ""}`
                          : mode === "auto"
                            ? " — материалы"
                            : ""}
                        {batch.reason ? ` (${batch.reason})` : ""}
                      </p>
                    ) : batch.reason ? (
                      <p className="text-muted">{batch.reason}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {hinted ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => sortItemsAction(ids, JSON.parse(hinted.value)))}
                        className={buttonClass("primary", "h-10 px-3 text-[14px]")}
                      >
                        Принять
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggle(ids)}
                      className={buttonClass("secondary", "h-10 px-3 text-[14px]")}
                    >
                      {allOn ? "Снять" : "Выбрать все"}
                    </button>
                  </div>
                </div>
                <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                  {batch.items.map((item) => {
                    const on = selected.has(item.id);
                    return (
                      <li key={item.id} className="relative">
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${on ? "Снять выбор" : "Выбрать"}: ${item.name}`}
                          onClick={() => toggle([item.id])}
                          className={`block aspect-square w-full overflow-hidden rounded-[10px] border-2 ${
                            on ? "border-accent" : "border-transparent"
                          } bg-chip`}
                        >
                          {item.kind === "photo" ? (
                            // eslint-disable-next-line @next/next/no-img-element -- private, session-checked previews
                            <img
                              src={`/media/${item.id}/preview`}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center text-[11px] text-ink-2">
                              <FileText size={22} aria-hidden />
                              <span className="line-clamp-3 break-all">{item.name}</span>
                            </span>
                          )}
                        </button>
                        {on ? (
                          <span className="pointer-events-none absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-accent-solid text-on-accent">
                            <Check size={15} strokeWidth={3} aria-hidden />
                          </span>
                        ) : null}
                        <a
                          href={`/view/${item.id}`}
                          target="_blank"
                          rel="noopener"
                          aria-label={`Открыть ${item.name}`}
                          className="absolute right-1 bottom-1 flex size-8 items-center justify-center rounded-full bg-viewer/70 text-on-viewer"
                        >
                          <Maximize2 size={14} aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface p-3 shadow-lg md:bottom-0">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">Выбрано: {selected.size}</p>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[14px] font-semibold text-ink-2"
              >
                Снять выбор
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={lessonValue}
                onChange={(e) => setLesson(e.target.value)}
                className={field}
                aria-label="К какой паре"
              >
                <option value="">Пара…</option>
                {lessons.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!lessonValue || pending}
                onClick={() => run(() => sortItemsAction([...selected], JSON.parse(lessonValue)))}
                className={buttonClass("primary", "h-11 shrink-0 px-4 text-[15px]")}
              >
                К паре
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={subjectValue}
                onChange={(e) => setSubject(e.target.value)}
                className={field}
                aria-label="Материалы какой дисциплины"
              >
                <option value="">Дисциплина…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!subjectValue || pending}
                onClick={() =>
                  run(() =>
                    sortItemsAction([...selected], { type: "materials", subjectId: subjectValue }),
                  )
                }
                className={buttonClass("secondary", "h-11 shrink-0 px-4 text-[15px]")}
              >
                В материалы
              </button>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Удалить с сайта: ${selected.size} шт.? Это для не учебного.`))
                  run(() => deleteItemsAction([...selected]));
              }}
              className={buttonClass("danger", "w-full")}
            >
              Удалить (не учебное)
            </button>
            {error ? <p className="text-[14px] font-semibold text-cancel">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
