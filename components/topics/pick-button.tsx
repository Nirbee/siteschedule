"use client";

import { useRef, useState, useTransition } from "react";
import {
  leaveTopicAction,
  setNameAndTakeAction,
  takeTopicAction,
  type TopicActionResult,
} from "@/app/(app)/topics/actions";
import { buttonClass } from "@/components/ui/button";

/** «Взять тему» / «Присоединиться» / «Освободить»; asks for «Фамилия Имя» the first time. */
export function PickButton({
  topicId,
  mode,
  topicTitle,
}: {
  topicId: string;
  mode: "take" | "join" | "leave";
  topicTitle: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  const handle = (result: TopicActionResult) => {
    if (result.ok) {
      setError(null);
      dialog.current?.close();
    } else if (result.needName) {
      setError(null);
      dialog.current?.showModal();
    } else setError(result.error);
  };

  const click = () =>
    start(async () => {
      if (mode === "leave") {
        if (!confirm(`Освободить тему «${topicTitle}»?`)) return;
        handle(await leaveTopicAction(topicId));
      } else handle(await takeTopicAction(topicId));
    });

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className={
          mode === "leave"
            ? buttonClass("ghost", "h-11 px-3 text-[14px]")
            : buttonClass("secondary", "h-11 px-4 text-[15px]")
        }
      >
        {pending
          ? "Секунду…"
          : mode === "take"
            ? "Взять тему"
            : mode === "join"
              ? "Присоединиться"
              : "Освободить"}
      </button>
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-cancel">
          {error}
        </p>
      ) : null}

      <dialog
        ref={dialog}
        className="m-auto w-[min(92vw,420px)] rounded-card border border-line bg-surface p-[22px] text-ink backdrop:bg-viewer/60"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => handle(await setNameAndTakeAction(topicId, name)));
          }}
          className="flex flex-col gap-3"
        >
          <h2 className="text-[19px] font-bold">Как записать тебя в список?</h2>
          <p className="text-[14px] text-muted">
            Фамилия и имя — как в списке группы. Это нужно один раз: так тебя увидит преподаватель.
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иванова Анна"
            autoComplete="name"
            maxLength={120}
            className="h-12 rounded-field border border-line-strong bg-surface px-3 text-[16px] text-ink"
          />
          {error ? <p className="text-[14px] font-semibold text-cancel">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || name.trim().length < 3}
              className={buttonClass("primary", "flex-1")}
            >
              {pending ? "Записываем…" : "Записаться"}
            </button>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className={buttonClass("ghost")}
            >
              Отмена
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
