"use client";

import { useActionState, useState } from "react";
import { UploadSheet } from "@/components/library/upload-sheet";
import { buttonClass } from "@/components/ui/button";
import { shortDate } from "@/lib/schedule/format";
import type { AssignmentInput } from "@/lib/tasks/inputs";
import type { DuePlace } from "@/lib/tasks/place";
import { deleteAssignmentAction, saveAssignmentAction, type TaskFormState } from "./actions";
import type { ChosenMaterial, LessonOption, TaskFormOptions } from "./form-types";
import { MaterialPicker } from "./material-picker";

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";

const dueValue = (due: DuePlace) => `${due.date}|${due.slotN ?? ""}|${due.startsAt ?? ""}`;

function parseDue(value: string): DuePlace {
  const [date = "", slot = "", startsAt = ""] = value.split("|");
  return { date, slotN: slot ? Number(slot) : null, startsAt: startsAt || null };
}

export interface AssignmentInitial {
  id: string;
  subjectId: string;
  due: DuePlace;
  body: string;
  materials: ChosenMaterial[];
}

export function AssignmentForm({
  options,
  initial,
  defaultSubjectId,
}: {
  options: TaskFormOptions;
  initial?: AssignmentInitial;
  defaultSubjectId?: string;
}) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(
    saveAssignmentAction,
    {},
  );
  const firstSubject = initial?.subjectId ?? defaultSubjectId ?? options.subjects[0]?.id ?? "";
  const defaultDue = (subjectId: string) =>
    options.nextDue[subjectId] ?? options.lessons[subjectId]?.[0]?.value ?? null;

  const [subjectId, setSubjectId] = useState(firstSubject);
  const initialLesson = initial
    ? initial.due.slotN !== null || initial.due.startsAt
      ? dueValue(initial.due)
      : null
    : defaultDue(firstSubject);
  const [mode, setMode] = useState<"lesson" | "date">(initialLesson ? "lesson" : "date");
  const [lesson, setLesson] = useState(initialLesson ?? "");
  const [date, setDate] = useState(initial?.due.date ?? options.today);
  const [body, setBody] = useState(initial?.body ?? "");
  const [materials, setMaterials] = useState<ChosenMaterial[]>(initial?.materials ?? []);

  // Upcoming lessons; an edited homework may point to a past one — keep it selectable.
  const lessonOptions: LessonOption[] = [...(options.lessons[subjectId] ?? [])];
  if (lesson && !lessonOptions.some((l) => l.value === lesson)) {
    const due = parseDue(lesson);
    lessonOptions.unshift({
      value: lesson,
      ...due,
      start: due.startsAt ?? "",
      end: "",
      label: `${shortDate(due.date)} · ${due.slotN !== null ? `${due.slotN} пара` : due.startsAt}`,
    });
  }

  const pickSubject = (next: string) => {
    setSubjectId(next);
    const due = defaultDue(next);
    setLesson(due ?? "");
    setMode(due ? "lesson" : "date");
  };

  const due: DuePlace | null =
    mode === "lesson"
      ? lesson
        ? parseDue(lesson)
        : null
      : date
        ? { date, slotN: null, startsAt: null }
        : null;
  const payload: AssignmentInput | null =
    subjectId && due && body.trim()
      ? { subjectId, due, body, materials: materials.map((m) => m.input) }
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

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-ink-2">Срок</span>
        {mode === "lesson" && lessonOptions.length ? (
          <select
            className={`${field} font-mono`}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            aria-label="К какой паре"
          >
            {lessonOptions.map((l) => (
              <option key={l.value} value={l.value}>
                {l.value === options.nextDue[subjectId] ? "Следующая пара: " : ""}
                {l.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="date"
            className={`${field} font-mono`}
            value={date}
            min={initial ? undefined : options.today}
            max={options.lastDate}
            onChange={(e) => setDate(e.target.value)}
            aria-label="К какой дате"
          />
        )}
        {lessonOptions.length ? (
          <button
            type="button"
            className="self-start text-[14px] font-semibold text-accent"
            onClick={() => {
              if (mode === "lesson") {
                if (lesson) setDate(parseDue(lesson).date);
                setMode("date");
              } else {
                setLesson(lesson || defaultDue(subjectId) || lessonOptions[0]!.value);
                setMode("lesson");
              }
            }}
          >
            {mode === "lesson" ? "Просто к дате (без пары)" : "К паре по расписанию"}
          </button>
        ) : (
          <p className="text-[13px] text-muted">
            Пар по этой дисциплине впереди нет — укажите дату.
          </p>
        )}
      </div>

      <label className={labelClass}>
        Что задано
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={3000}
          className="rounded-field border border-line-strong bg-surface p-3 text-[15px] leading-[1.45] text-ink"
          placeholder={
            "Каждый пункт с новой строки, например:\nПрочитать главу 0\nОтношение эквивалентности (стр. 52)"
          }
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-ink-2">Материалы</span>
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
        <DeleteForm id={initial.id} action={deleteAssignmentAction} what="задание" />
      ) : null}
    </div>
  );
}

export function DeleteForm({
  id,
  action,
  what,
}: {
  id: string;
  action: (formData: FormData) => Promise<void>;
  what: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Удалить ${what}? Отменить это нельзя.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={buttonClass("danger", "w-full")}>
        Удалить {what}
      </button>
    </form>
  );
}
