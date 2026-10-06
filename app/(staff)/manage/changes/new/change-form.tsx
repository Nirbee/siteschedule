"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import type { IsoDate } from "@/lib/schedule/dates";
import { describeChange, type ChangeDescription } from "@/lib/schedule/describe";
import { CHANGE_TYPE_LABELS, KIND_LABELS, shortDate } from "@/lib/schedule/format";
import type { ChangeInput } from "@/lib/schedule/inputs";
import type { ChangeType, LessonKind, TimeRange } from "@/lib/schedule/types";
import { createChangeAction, type ChangeFormState } from "../actions";

export interface LessonOption {
  key: string;
  entryId: string;
  date: IsoDate;
  slotN: number | null;
  time: TimeRange;
  subjectName: string;
  kind: LessonKind;
  room: string | null;
  changed: boolean;
  groupIds: string[];
}

interface Props {
  lessons: LessonOption[];
  subjects: { id: string; name: string }[];
  slots: { n: number; start: string; end: string }[];
  groups: { id: string; code: string }[];
  today: IsoDate;
  lastDate: IsoDate;
}

const TYPES: ChangeType[] = ["cancel", "replace", "move", "add", "room"];
const KINDS: LessonKind[] = ["lecture", "seminar", "practice", "lab"];

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";

export function ChangeForm({ lessons, subjects, slots, groups, today, lastDate }: Props) {
  const [state, action, pending] = useActionState<ChangeFormState, FormData>(
    createChangeAction,
    {},
  );
  const [type, setType] = useState<ChangeType>("cancel");
  const [lessonKey, setLessonKey] = useState(lessons[0]?.key ?? "");
  const lesson = lessons.find((l) => l.key === lessonKey);

  const [newSubjectId, setNewSubjectId] = useState("");
  const [newKind, setNewKind] = useState<LessonKind | "">("");
  const [newRoom, setNewRoom] = useState("");
  const [newDate, setNewDate] = useState<IsoDate>(today);
  const [timeMode, setTimeMode] = useState<"slot" | "custom">("slot");
  const [slotN, setSlotN] = useState<number>(slots[0]?.n ?? 1);
  const [startsAt, setStartsAt] = useState("10:00");
  const [endsAt, setEndsAt] = useState("11:30");
  const [comment, setComment] = useState("");
  const [groupIds, setGroupIds] = useState<string[] | null>(null);

  const isAdd = type === "add";
  const defaultGroups = isAdd ? groups.map((g) => g.id) : (lesson?.groupIds ?? []);
  const selectedGroups = groupIds ?? defaultGroups;
  const availableGroups = isAdd ? groups : groups.filter((g) => lesson?.groupIds.includes(g.id));

  const target = timeMode === "slot" ? { slotN } : { startsAt, endsAt };
  const targetTime: TimeRange | undefined =
    timeMode === "slot"
      ? slots.find((s) => s.n === slotN)
      : startsAt && endsAt
        ? { start: startsAt, end: endsAt }
        : undefined;
  const subjectName = subjects.find((s) => s.id === newSubjectId)?.name;

  const { payload, preview } = ((): { payload: ChangeInput | null; preview: string | null } => {
    const common = { groupIds: selectedGroups, comment: comment || null };
    if (isAdd) {
      if (!newSubjectId || !targetTime) return { payload: null, preview: null };
      const kind = newKind || "lecture";
      return {
        payload: {
          type: "add",
          date: newDate,
          target,
          newSubjectId,
          newKind: kind,
          newRoom: newRoom || null,
          ...common,
        },
        preview: describeChange({
          type: "add",
          newSubject: subjectName!,
          kind,
          date: newDate,
          time: targetTime,
          newRoom,
        }),
      };
    }
    if (!lesson) return { payload: null, preview: null };
    const base = { entryId: lesson.entryId, date: lesson.date, ...common };
    const ref = { subject: lesson.subjectName, date: lesson.date, time: lesson.time };
    let description: ChangeDescription | null = null;
    let input: ChangeInput | null = null;
    switch (type) {
      case "cancel":
        input = { type, ...base };
        description = { type, ...ref };
        break;
      case "replace":
        if (newSubjectId) {
          input = {
            type,
            ...base,
            newSubjectId,
            newKind: newKind || undefined,
            newRoom: newRoom || null,
          };
          description = { type, ...ref, newSubject: subjectName!, newRoom };
        }
        break;
      case "room":
        if (newRoom.trim()) {
          input = { type, ...base, newRoom };
          description = { type, ...ref, oldRoom: lesson.room, newRoom };
        }
        break;
      case "move":
        if (targetTime) {
          input = { type, ...base, newDate, target, newRoom: newRoom || null };
          description = { type, ...ref, newDate, newTime: targetTime, newRoom };
        }
        break;
    }
    return { payload: input, preview: description ? describeChange(description) : null };
  })();

  const pickType = (next: ChangeType) => {
    setType(next);
    setGroupIds(null);
    setNewRoom("");
    if (next === "move" && lesson) setNewDate(lesson.date);
  };

  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <div
        role="radiogroup"
        aria-label="Тип изменения"
        className="grid grid-cols-3 gap-1.5 rounded-[14px] bg-bg p-1"
      >
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => pickType(t)}
            className={`h-11 rounded-[10px] text-[14px] ${
              type === t
                ? "bg-emph font-bold text-on-emph"
                : "font-semibold text-ink-2 hover:bg-chip"
            }`}
          >
            {CHANGE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {isAdd ? (
        <>
          <label className={labelClass}>
            Предмет
            <select
              className={field}
              value={newSubjectId}
              onChange={(e) => setNewSubjectId(e.target.value)}
              required
            >
              <option value="">Выберите…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Тип занятия
            <select
              className={field}
              value={newKind || "lecture"}
              onChange={(e) => setNewKind(e.target.value as LessonKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {whenFields()}
        </>
      ) : lessons.length === 0 ? (
        <p className="rounded-[12px] bg-surface-muted p-4 text-ink-2">
          В ближайшие две недели пар нет — изменять нечего.
        </p>
      ) : (
        <label className={labelClass}>
          Какая пара
          <select
            className={field}
            value={lessonKey}
            onChange={(e) => {
              setLessonKey(e.target.value);
              setGroupIds(null);
              const next = lessons.find((l) => l.key === e.target.value);
              if (next && type === "move") setNewDate(next.date);
            }}
          >
            {lessons.map((l) => (
              <option key={l.key} value={l.key}>
                {shortDate(l.date)} · {l.time.start} · {l.subjectName}
                {l.changed ? " (уже изменена)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {type === "replace" ? (
        <>
          <label className={labelClass}>
            Что будет вместо
            <select
              className={field}
              value={newSubjectId}
              onChange={(e) => setNewSubjectId(e.target.value)}
            >
              <option value="">Выберите…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Тип занятия
            <select
              className={field}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as LessonKind | "")}
            >
              <option value="">
                Как было{lesson ? ` (${KIND_LABELS[lesson.kind].toLowerCase()})` : ""}
              </option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {type === "move" ? whenFields() : null}

      {type !== "cancel" ? (
        <label className={labelClass}>
          {type === "room" ? "Новая аудитория" : "Аудитория (если меняется)"}
          <input
            className={field}
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder={lesson?.room && type !== "add" ? `сейчас ${lesson.room}` : "например, 514"}
            maxLength={40}
          />
        </label>
      ) : null}

      <label className={labelClass}>
        Комментарий для группы
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          className="rounded-field border border-line-strong bg-surface p-3 text-[15px] leading-[1.45] text-ink"
          placeholder="Необязательно"
        />
      </label>

      {availableGroups.length > 1 ? (
        <details className="rounded-[12px] border border-line p-3">
          <summary className="cursor-pointer text-[14px] font-semibold text-ink-2">
            Дополнительно: для каких групп ({selectedGroups.length} из {availableGroups.length})
          </summary>
          <div className="mt-3 flex flex-col gap-1">
            {availableGroups.map((g) => (
              <label key={g.id} className="flex min-h-11 items-center gap-3 font-mono text-[15px]">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-accent-solid)]"
                  checked={selectedGroups.includes(g.id)}
                  onChange={(e) =>
                    setGroupIds(
                      e.target.checked
                        ? [...selectedGroups, g.id]
                        : selectedGroups.filter((id) => id !== g.id),
                    )
                  }
                />
                {g.code}
              </label>
            ))}
          </div>
        </details>
      ) : null}

      <div className="rounded-[14px] bg-bg p-[14px] text-[14px] leading-[1.45] text-ink-2">
        <div className="mb-1.5 text-[12px] font-bold text-muted">Так увидят однокурсники</div>
        {preview ? (
          <>
            <strong className="text-ink">{preview}</strong>
            {comment ? <p className="mt-1">{comment}</p> : null}
          </>
        ) : (
          <span>Заполните поля выше.</span>
        )}
      </div>

      {state.error ? (
        <p role="alert" className="rounded-[12px] bg-cancel-bg p-3 font-semibold text-cancel">
          {state.error}
        </p>
      ) : null}

      <input type="hidden" name="payload" value={payload ? JSON.stringify(payload) : ""} />
      <button
        type="submit"
        disabled={!payload || pending || selectedGroups.length === 0}
        className={buttonClass("primary", "w-full")}
      >
        {pending ? "Публикуем…" : "Опубликовать для группы"}
      </button>
    </form>
  );

  function whenFields() {
    return (
      <>
        <label className={labelClass}>
          {isAdd ? "Дата" : "Новая дата"}
          <input
            type="date"
            className={`${field} font-mono`}
            value={newDate}
            min={today}
            max={lastDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-ink-2">Время</span>
          {timeMode === "slot" ? (
            <select
              className={`${field} font-mono`}
              value={slotN}
              onChange={(e) => setSlotN(Number(e.target.value))}
              aria-label="Пара по сетке звонков"
            >
              {slots.map((s) => (
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
        </div>
      </>
    );
  }
}
