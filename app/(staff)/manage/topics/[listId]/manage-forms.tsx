"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import type { TopicView } from "@/lib/services/topics";
import {
  addTopicsAction,
  assignMemberAction,
  setOpensAtAction,
  updateTopicAction,
  updateTopicListAction,
  type FormState,
} from "../actions";
import { TopicsField } from "../topics-field";

const small =
  "h-11 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";

function Message({ state, ok }: { state: FormState; ok?: string }) {
  if (state.error)
    return (
      <p role="alert" className="text-[14px] font-semibold text-cancel">
        {state.error}
      </p>
    );
  if (state.ok && ok) return <p className="text-[14px] font-semibold text-add">{ok}</p>;
  return null;
}

/** «Открыть для всех»: now, at a time, or cancel a schedule. */
export function OpensAtForm({
  listId,
  scheduled,
  isOpen,
}: {
  listId: string;
  scheduled: string;
  isOpen: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(setOpensAtAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="listId" value={listId} />
      {isOpen ? (
        <button
          type="submit"
          name="mode"
          value="cancel"
          disabled={pending}
          className={buttonClass("secondary", "self-start")}
          onClick={(e) => {
            if (!confirm("Закрыть запись для всех? Выбранные темы останутся.")) e.preventDefault();
          }}
        >
          Закрыть запись для всех
        </button>
      ) : (
        <>
          <button
            type="submit"
            name="mode"
            value="now"
            disabled={pending}
            className={buttonClass("secondary", "w-full")}
          >
            Открыть для всех сейчас
          </button>
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${labelClass} min-w-[200px] flex-1`}>
              Или автоматически
              <input
                name="opensAt"
                type="datetime-local"
                defaultValue={scheduled}
                className={`${small} font-mono`}
              />
            </label>
            <button
              type="submit"
              name="mode"
              value="schedule"
              disabled={pending}
              className={buttonClass("secondary", "h-11")}
            >
              Запланировать
            </button>
            {scheduled ? (
              <button
                type="submit"
                name="mode"
                value="cancel"
                disabled={pending}
                className={buttonClass("ghost", "h-11")}
              >
                Отменить
              </button>
            ) : null}
          </div>
        </>
      )}
      <Message state={state} ok="Сохранено" />
    </form>
  );
}

export function AssignForm({
  listId,
  topics,
  people,
}: {
  listId: string;
  topics: TopicView[];
  people: { id: string; name: string; group: string | null }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(assignMemberAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="listId" value={listId} />
      <select name="topicId" className={small} aria-label="Тема" required>
        {topics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.n}. {t.title}
            {t.details ? ` — ${t.details}` : ""} ({t.members.length}/{t.capacity})
          </option>
        ))}
      </select>
      <select name="userId" className={small} aria-label="Кого записать" defaultValue="">
        <option value="">Кого записать…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.group ? ` · ${p.group}` : ""}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        Записать
      </button>
      <Message state={state} ok="Записали" />
      <p className="text-[13px] text-muted">
        Если человек уже записан на другую тему этого списка, он переедет. Здесь видны только те,
        кто хотя бы раз заходил на сайт.
      </p>
    </form>
  );
}

export function TopicEditForm({ listId, topic }: { listId: string; topic: TopicView }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTopicAction, {});
  return (
    <form action={action} className="mt-3 flex flex-col gap-2.5">
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="topicId" value={topic.id} />
      <label className={labelClass}>
        Тема
        <input name="title" defaultValue={topic.title} maxLength={300} className={small} />
      </label>
      <label className={labelClass}>
        Подтема
        <input
          name="details"
          defaultValue={topic.details ?? ""}
          maxLength={300}
          className={small}
          placeholder="Необязательно"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className={labelClass}>
          Мест
          <input
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            defaultValue={topic.capacity}
            className={`${small} font-mono`}
          />
        </label>
        <label className={`${labelClass} col-span-2`}>
          Дата сдачи
          <input
            name="dueDate"
            type="date"
            defaultValue={topic.dueDate ?? ""}
            className={`${small} font-mono`}
          />
        </label>
      </div>
      <label className={labelClass}>
        Порядок выступления в этот день
        <input
          name="dueOrder"
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          defaultValue={topic.dueOrder ?? ""}
          className={`${small} font-mono`}
          placeholder="1, 2, 3…"
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        Сохранить тему
      </button>
      <Message state={state} ok="Сохранено" />
    </form>
  );
}

export function AddTopicsForm({ listId }: { listId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addTopicsAction, {});
  return (
    <form action={action} className="flex flex-col gap-2.5" key={state.ok ? "done" : "edit"}>
      <input type="hidden" name="listId" value={listId} />
      <TopicsField />
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        Добавить темы
      </button>
      <Message state={state} ok="Добавили" />
    </form>
  );
}

export function ListSettingsForm({
  listId,
  children,
}: {
  listId: string;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTopicListAction, {});
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <input type="hidden" name="listId" value={listId} />
      {children}
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        Сохранить
      </button>
      <Message state={state} ok="Сохранено" />
    </form>
  );
}

export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        readOnly
        value={text}
        rows={Math.min(12, text.split("\n").length + 1)}
        className="rounded-field border border-line bg-surface-muted p-3 font-mono text-[13px] leading-relaxed text-ink"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className={buttonClass("secondary", "self-start")}
      >
        {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
        {copied ? "Скопировано" : "Скопировать для чата"}
      </button>
    </div>
  );
}
