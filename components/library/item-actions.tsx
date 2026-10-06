"use client";

import { useActionState } from "react";
import { MoreHorizontal } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import {
  deleteMediaAction,
  renameMediaAction,
  setNoteTitleAction,
  type ActionState,
} from "@/app/(app)/library/actions";

const field =
  "h-11 w-full min-w-0 rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";

/** «⋯» menu for a photo/file: rename (files) and delete. Shown only to those who may edit. */
export function ItemActions({
  id,
  title,
  kind,
}: {
  id: string;
  title: string | null;
  kind: "photo" | "file";
}) {
  const [renameState, rename, renaming] = useActionState<ActionState, FormData>(
    renameMediaAction,
    {},
  );
  const [deleteState, remove, deleting] = useActionState<ActionState, FormData>(
    deleteMediaAction,
    {},
  );
  const error = renameState.error ?? deleteState.error;

  return (
    <details className="relative">
      <summary
        aria-label="Действия"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-field text-muted hover:bg-chip [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={20} />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex w-72 flex-col gap-2 rounded-[14px] border border-line bg-surface p-3 shadow-lg">
        {kind === "file" ? (
          <form action={rename} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <label className="flex flex-col gap-1 text-[13px] font-bold text-ink-2">
              Название
              <input name="title" defaultValue={title ?? ""} maxLength={200} className={field} />
            </label>
            <button type="submit" disabled={renaming} className={buttonClass("secondary")}>
              Сохранить название
            </button>
          </form>
        ) : null}
        <form
          action={remove}
          onSubmit={(e) => {
            if (!confirm(kind === "photo" ? "Удалить это фото?" : "Удалить этот файл?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={deleting} className={buttonClass("danger", "w-full")}>
            Удалить
          </button>
        </form>
        {error ? <p className="text-[13px] font-semibold text-cancel">{error}</p> : null}
      </div>
    </details>
  );
}

/** Lesson topic editor (starostas and people who uploaded to the lesson). */
export function NoteTitleForm({ id, title }: { id: string; title: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setNoteTitleAction, {});
  return (
    <details>
      <summary className="cursor-pointer text-[13px] font-semibold text-accent">
        {title ? "Изменить тему" : "Указать тему занятия"}
      </summary>
      <form action={action} className="mt-2 flex gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="title"
          defaultValue={title ?? ""}
          placeholder="Тема занятия"
          maxLength={200}
          className={field}
        />
        <button type="submit" disabled={pending} className={buttonClass("secondary", "shrink-0")}>
          OK
        </button>
      </form>
      {state.error ? <p className="mt-1 text-[13px] text-cancel">{state.error}</p> : null}
    </details>
  );
}
