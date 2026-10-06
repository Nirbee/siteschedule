"use client";

import { useActionState, useState } from "react";
import { UploadSheet } from "@/components/library/upload-sheet";
import { buttonClass } from "@/components/ui/button";
import { CONTROL_FORMS, type ControlEventInput } from "@/lib/tasks/inputs";
import { deleteControlEventAction, saveControlEventAction, type TaskFormState } from "./actions";
import { DeleteForm } from "./assignment-form";
import type { ChosenMaterial, TaskFormOptions } from "./form-types";
import { MaterialPicker } from "./material-picker";

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";
const area =
  "rounded-field border border-line-strong bg-surface p-3 text-[15px] leading-[1.45] text-ink";

export interface ControlInitial {
  id: string;
  subjectId: string;
  date: string;
  slotN: number | null;
  startsAt: string | null;
  endsAt: string | null;
  form: string;
  room: string | null;
  topics: string | null;
  rules: string | null;
  admission: string | null;
  materials: ChosenMaterial[];
}

export function ControlForm({
  options,
  initial,
  defaultSubjectId,
}: {
  options: TaskFormOptions;
  initial?: ControlInitial;
  defaultSubjectId?: string;
}) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(
    saveControlEventAction,
    {},
  );
  const [subjectId, setSubjectId] = useState(
    initial?.subjectId ?? defaultSubjectId ?? options.subjects[0]?.id ?? "",
  );
  const lessons = options.lessons[subjectId] ?? [];
  const initialLesson = initial
    ? lessons.find(
        (l) =>
          l.date === initial.date &&
          (initial.slotN !== null ? l.slotN === initial.slotN : l.startsAt === initial.startsAt),
      )?.value
    : (options.nextDue[subjectId] ?? undefined);

  // «На паре» picks date and time from the schedule; otherwise date + slot or custom time.
  const [mode, setMode] = useState<"lesson" | "custom">(initialLesson ? "lesson" : "custom");
  const [lesson, setLesson] = useState(initialLesson ?? "");
  const [date, setDate] = useState(initial?.date ?? options.today);
  const [timeMode, setTimeMode] = useState<"slot" | "custom">(
    initial && initial.slotN === null ? "custom" : "slot",
  );
  const [slotN, setSlotN] = useState(initial?.slotN ?? options.slots[0]?.n ?? 1);
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? "10:00");
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? "11:30");
  const [form, setForm] = useState(initial?.form ?? CONTROL_FORMS[0]!);
  const [room, setRoom] = useState(initial?.room ?? "");
  const [topics, setTopics] = useState(initial?.topics ?? "");
  const [rules, setRules] = useState(initial?.rules ?? "");
  const [admission, setAdmission] = useState(initial?.admission ?? "");
  const [materials, setMaterials] = useState<ChosenMaterial[]>(initial?.materials ?? []);

  const pickSubject = (next: string) => {
    setSubjectId(next);
    const due = options.nextDue[next];
    setLesson(due ?? "");
    setMode(due ? "lesson" : "custom");
  };

  const picked = lessons.find((l) => l.value === lesson);
  const when: Pick<ControlEventInput, "date" | "target"> | null =
    mode === "lesson"
      ? picked
        ? {
            date: picked.date,
            target:
              picked.slotN !== null
                ? { slotN: picked.slotN }
                : { startsAt: picked.start, endsAt: picked.end },
          }
        : null
      : date
        ? { date, target: timeMode === "slot" ? { slotN } : { startsAt, endsAt } }
        : null;
  const payload: ControlEventInput | null =
    subjectId && when && form.trim()
      ? {
          subjectId,
          ...when,
          form,
          room,
          topics,
          rules,
          admission,
          materials: materials.map((m) => m.input),
        }
      : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <label className={labelClass}>
        Дисциплина
        <select className={field} value={subjectId} onChange={(e) => pickSubject(e.target.value)}>
          {options.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Форма
        <input
          className={field}
          value={form}
          onChange={(e) => setForm(e.target.value)}
          list="control-forms"
          maxLength={80}
        />
        <datalist id="control-forms">
          {CONTROL_FORMS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-ink-2">Когда</span>
        {mode === "lesson" ? (
          <select
            className={`${field} font-mono`}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            aria-label="На какой паре"
          >
            {lessons.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="date"
              className={`${field} font-mono`}
              value={date}
              max={options.lastDate}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Дата"
            />
            {timeMode === "slot" ? (
              <select
                className={`${field} font-mono`}
                value={slotN}
                onChange={(e) => setSlotN(Number(e.target.value))}
                aria-label="Пара по сетке звонков"
              >
                {options.slots.map((s) => (
                  <option key={s.n} value={s.n}>
                    {s.n} пара · {s.start}–{s.end}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="time"
                  aria-label="Начало"
                  className={`${field} font-mono`}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <input
                  type="time"
                  aria-label="Конец"
                  className={`${field} font-mono`}
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="self-start text-[14px] font-semibold text-accent"
              onClick={() => setTimeMode(timeMode === "slot" ? "custom" : "slot")}
            >
              {timeMode === "slot" ? "Другое время" : "Выбрать пару по сетке"}
            </button>
          </>
        )}
        {lessons.length ? (
          <button
            type="button"
            className="self-start text-[14px] font-semibold text-accent"
            onClick={() => {
              if (mode === "lesson") {
                if (picked) {
                  setDate(picked.date);
                  if (picked.slotN !== null) {
                    setTimeMode("slot");
                    setSlotN(picked.slotN);
                  } else {
                    setTimeMode("custom");
                    setStartsAt(picked.start);
                    setEndsAt(picked.end);
                  }
                }
                setMode("custom");
              } else {
                setLesson(lesson || options.nextDue[subjectId] || lessons[0]!.value);
                setMode("lesson");
              }
            }}
          >
            {mode === "lesson" ? "Не на паре — указать дату и время" : "На паре по расписанию"}
          </button>
        ) : null}
      </div>

      <label className={labelClass}>
        Аудитория
        <input
          className={field}
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Если не там, где пара"
          maxLength={40}
        />
      </label>

      <label className={labelClass}>
        Вопросы и темы
        <textarea
          rows={6}
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
          maxLength={3000}
          className={area}
          placeholder={
            "Каждый вопрос или тема с новой строки — можно вставить список из чата:\n1. Определение информации\n2. Алгоритмы на графах"
          }
        />
      </label>

      <label className={labelClass}>
        Можно / нельзя
        <textarea
          rows={2}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          maxLength={1000}
          className={area}
          placeholder={"Например:\nМожно пользоваться записями\nТелефоны сдаём"}
        />
      </label>

      <label className={labelClass}>
        Условия допуска
        <textarea
          rows={2}
          value={admission}
          onChange={(e) => setAdmission(e.target.value)}
          maxLength={1000}
          className={area}
          placeholder="Необязательно"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-ink-2">Материалы для подготовки</span>
        <MaterialPicker
          options={options.materials[subjectId] ?? []}
          value={materials}
          onChange={setMaterials}
        />
        <UploadSheet
          key={subjectId}
          {...options.upload}
          subjectId={subjectId}
          label="Загрузить файл"
          secondary
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-[12px] bg-cancel-bg p-3 font-semibold text-cancel">
          {state.error}
        </p>
      ) : null}

      <form action={action}>
        <input type="hidden" name="id" value={initial?.id ?? ""} />
        <input type="hidden" name="payload" value={payload ? JSON.stringify(payload) : ""} />
        <button
          type="submit"
          disabled={!payload || pending}
          className={buttonClass("primary", "w-full")}
        >
          {pending ? "Сохраняем…" : initial ? "Сохранить" : "Опубликовать для группы"}
        </button>
      </form>

      {initial ? (
        <DeleteForm id={initial.id} action={deleteControlEventAction} what="контрольную" />
      ) : null}
    </div>
  );
}
