"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wand2, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import type { GradingConfig } from "@/lib/grades/scheme";
import { KIND_LABELS } from "@/lib/schedule/format";
import { saveSchemeAction } from "../actions";

type Kind = "lecture" | "seminar" | "practice" | "lab";
const KINDS: Kind[] = ["lecture", "seminar", "practice", "lab"];

const input =
  "h-11 w-full min-w-0 rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const num = `${input} font-mono text-center`;
const labelClass = "flex flex-col gap-1 text-[12px] font-bold text-ink-2";

const newKey = () => `i${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const EMPTY: GradingConfig = {
  modules: [{ title: "Модуль 1", until: null, min: 0 }],
  attendance: { points: 2, kinds: ["lecture", "seminar"] },
  items: [],
  extras: [],
  scale: [
    { from: 60, label: "Зачтено" },
    { from: 0, label: "Не зачтено" },
  ],
  total: 100,
  teacherId: null,
  note: "",
};

/** By the slides of «Основы предпринимательства». */
const TEMPLATE: GradingConfig = {
  modules: [
    { title: "Модуль 1", until: null, min: 18 },
    { title: "Модуль 2", until: null, min: 18 },
    { title: "Модуль 3", until: null, min: 24 },
  ],
  attendance: { points: 2, kinds: ["lecture"] },
  items: [0, 1, 2].flatMap((m) => [
    { key: `rk${m + 1}`, title: `РК ${m + 1}`, module: m, max: 10 },
    { key: `task${m + 1}`, title: "Индивидуальное задание", module: m, max: 5 },
  ]),
  extras: [],
  scale: [
    { from: 85, label: "Зачтено" },
    { from: 71, label: "Зачтено" },
    { from: 60, label: "Зачтено" },
    { from: 0, label: "Не зачтено" },
  ],
  total: 100,
  teacherId: null,
  note: "Опоздание, уход с занятия — минус баллы.",
};

export function SchemeEditor({
  subjectId,
  initial,
  teachers,
  files,
}: {
  subjectId: string;
  initial: GradingConfig | null;
  teachers: { id: string; name: string }[];
  files: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [c, setC] = useState<GradingConfig>(initial ?? EMPTY);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<GradingConfig>) => setC((prev) => ({ ...prev, ...patch }));
  const n = (v: string) => (v === "" ? 0 : Number(v));

  const save = () =>
    start(async () => {
      const result = await saveSchemeAction(subjectId, c);
      setMessage(result.ok ? { ok: true, text: "Сохранено" } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {!initial ? (
        <button
          type="button"
          onClick={() => setC(TEMPLATE)}
          className={buttonClass("secondary", "self-start")}
        >
          <Wand2 size={18} aria-hidden /> Заполнить по слайдам Основ предпринимательства
        </button>
      ) : null}

      <Section title="Модули">
        {c.modules.map((m, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9rem_5rem_auto]"
          >
            <label className={`${labelClass} col-span-2 sm:col-span-1`}>
              Название
              <input
                className={input}
                value={m.title}
                onChange={(e) =>
                  set({
                    modules: c.modules.map((x, j) =>
                      j === i ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label className={labelClass}>
              Последний день
              <input
                type="date"
                className={`${input} font-mono`}
                value={m.until ?? ""}
                onChange={(e) =>
                  set({
                    modules: c.modules.map((x, j) =>
                      j === i ? { ...x, until: e.target.value || null } : x,
                    ),
                  })
                }
              />
            </label>
            <label className={labelClass}>
              Минимум
              <input
                type="number"
                inputMode="decimal"
                className={num}
                value={m.min}
                onChange={(e) =>
                  set({
                    modules: c.modules.map((x, j) =>
                      j === i ? { ...x, min: n(e.target.value) } : x,
                    ),
                  })
                }
              />
            </label>
            <RemoveButton
              disabled={c.modules.length === 1}
              label={`Убрать ${m.title}`}
              onClick={() =>
                set({
                  modules: c.modules.filter((_, j) => j !== i),
                  items: c.items
                    .filter((it) => it.module !== i)
                    .map((it) => (it.module > i ? { ...it, module: it.module - 1 } : it)),
                })
              }
            />
          </div>
        ))}
        <p className="text-[13px] text-muted">
          Пустая дата у последнего модуля — до конца семестра. Можно уточнить позже.
        </p>
        <AddButton
          onClick={() =>
            set({
              modules: [
                ...c.modules,
                { title: `Модуль ${c.modules.length + 1}`, until: null, min: 0 },
              ],
            })
          }
        >
          Модуль
        </AddButton>
      </Section>

      <Section title="Посещение">
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-accent-solid)]"
            checked={c.attendance !== null}
            onChange={(e) =>
              set({
                attendance: e.target.checked ? { points: 2, kinds: ["lecture", "seminar"] } : null,
              })
            }
          />
          Баллы за посещение
        </label>
        {c.attendance ? (
          <>
            <label className={`${labelClass} max-w-40`}>
              Баллов за занятие
              <input
                type="number"
                inputMode="decimal"
                className={num}
                value={c.attendance.points}
                onChange={(e) =>
                  set({ attendance: { ...c.attendance!, points: n(e.target.value) } })
                }
              />
            </label>
            <div className="flex flex-wrap gap-x-4">
              {KINDS.map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-accent-solid)]"
                    checked={c.attendance!.kinds.includes(k)}
                    onChange={(e) =>
                      set({
                        attendance: {
                          ...c.attendance!,
                          kinds: e.target.checked
                            ? [...c.attendance!.kinds, k]
                            : c.attendance!.kinds.filter((x) => x !== k),
                        },
                      })
                    }
                  />
                  {KIND_LABELS[k]}
                </label>
              ))}
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Контрольные и задания">
        {c.items.map((it, i) => (
          <div
            key={it.key}
            className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9rem_5rem_auto]"
          >
            <label className={`${labelClass} col-span-2 sm:col-span-1`}>
              Что
              <input
                className={input}
                value={it.title}
                onChange={(e) =>
                  set({
                    items: c.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  })
                }
              />
            </label>
            <label className={labelClass}>
              Модуль
              <select
                className={input}
                value={it.module}
                onChange={(e) =>
                  set({
                    items: c.items.map((x, j) =>
                      j === i ? { ...x, module: Number(e.target.value) } : x,
                    ),
                  })
                }
              >
                {c.modules.map((m, k) => (
                  <option key={k} value={k}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              До баллов
              <input
                type="number"
                inputMode="decimal"
                className={num}
                value={it.max}
                onChange={(e) =>
                  set({
                    items: c.items.map((x, j) => (j === i ? { ...x, max: n(e.target.value) } : x)),
                  })
                }
              />
            </label>
            <RemoveButton
              label={`Убрать ${it.title}`}
              onClick={() => set({ items: c.items.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <AddButton
          onClick={() =>
            set({ items: [...c.items, { key: newKey(), title: "РК", module: 0, max: 10 }] })
          }
        >
          Контрольная или задание
        </AddButton>
      </Section>

      <Section title="Итог">
        <label className={`${labelClass} max-w-40`}>
          Всего баллов
          <input
            type="number"
            className={num}
            value={c.total}
            onChange={(e) => set({ total: n(e.target.value) })}
          />
        </label>
        {c.scale.map((s, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr_auto] gap-2">
            <label className={labelClass}>
              От
              <input
                type="number"
                className={num}
                value={s.from}
                onChange={(e) =>
                  set({
                    scale: c.scale.map((x, j) => (j === i ? { ...x, from: n(e.target.value) } : x)),
                  })
                }
              />
            </label>
            <label className={labelClass}>
              Оценка
              <input
                className={input}
                value={s.label}
                onChange={(e) =>
                  set({
                    scale: c.scale.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  })
                }
              />
            </label>
            <RemoveButton
              disabled={c.scale.length === 1}
              label="Убрать строку"
              onClick={() => set({ scale: c.scale.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <AddButton onClick={() => set({ scale: [...c.scale, { from: 0, label: "" }] })}>
          Строка шкалы
        </AddButton>
      </Section>

      <Section title="Если баллов не хватает">
        <label className={labelClass}>
          Кому отправлять работы
          <select
            className={input}
            value={c.teacherId ?? ""}
            onChange={(e) => set({ teacherId: e.target.value || null })}
          >
            <option value="">Преподаватель дисциплины (из «Преподавателей»)</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {c.extras.map((x, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-[12px] border border-line p-3">
            <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
              <label className={labelClass}>
                Доп. задание
                <input
                  className={input}
                  value={x.title}
                  onChange={(e) =>
                    set({
                      extras: c.extras.map((y, j) =>
                        j === i ? { ...y, title: e.target.value } : y,
                      ),
                    })
                  }
                />
              </label>
              <label className={labelClass}>
                До баллов
                <input
                  type="number"
                  className={num}
                  value={x.max}
                  onChange={(e) =>
                    set({
                      extras: c.extras.map((y, j) =>
                        j === i ? { ...y, max: n(e.target.value) } : y,
                      ),
                    })
                  }
                />
              </label>
              <RemoveButton
                label="Убрать задание"
                onClick={() => set({ extras: c.extras.filter((_, j) => j !== i) })}
              />
            </div>
            <textarea
              rows={2}
              className="rounded-field border border-line-strong bg-surface p-3 text-[15px] text-ink"
              placeholder="Что сделать, как оформить"
              value={x.text}
              onChange={(e) =>
                set({
                  extras: c.extras.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)),
                })
              }
            />
            <select
              className={input}
              value={x.mediaId ?? ""}
              aria-label="Файл задания"
              onChange={(e) =>
                set({
                  extras: c.extras.map((y, j) =>
                    j === i ? { ...y, mediaId: e.target.value || null } : y,
                  ),
                })
              }
            >
              <option value="">Без файла (файлы — из «Материалов» дисциплины)</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        <AddButton
          onClick={() =>
            set({ extras: [...c.extras, { title: "", text: "", max: 5, mediaId: null }] })
          }
        >
          Доп. задание
        </AddButton>
      </Section>

      <Section title="Заметка для студентов">
        <textarea
          rows={2}
          className="rounded-field border border-line-strong bg-surface p-3 text-[15px] text-ink"
          value={c.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="Например: опоздание — минус баллы"
        />
      </Section>

      {message ? (
        <p role="status" className={`font-semibold ${message.ok ? "text-add" : "text-cancel"}`}>
          {message.text}
        </p>
      ) : null}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className={buttonClass("primary", "w-full")}
      >
        {pending ? "Сохраняем…" : "Сохранить систему баллов"}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[14px] md:p-[18px]">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-[14px] font-semibold text-accent"
    >
      <Plus size={16} aria-hidden /> {children}
    </button>
  );
}

function RemoveButton({
  onClick,
  label,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="mt-5 flex size-11 items-center justify-center rounded-full text-muted hover:bg-chip disabled:opacity-30"
    >
      <X size={18} aria-hidden />
    </button>
  );
}
