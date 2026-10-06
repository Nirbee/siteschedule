"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { saveFullNameAction, type NameState } from "./actions";

/** «Фамилия Имя» for topic lists sent to teachers. */
export function FullNameForm({ initial }: { initial: string | null }) {
  const [state, action, pending] = useActionState<NameState, FormData>(saveFullNameAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-2">
        Фамилия и имя для списков тем
        <div className="flex gap-2">
          <input
            name="fullName"
            defaultValue={initial ?? ""}
            placeholder="Иванова Анна"
            autoComplete="name"
            maxLength={120}
            className="h-11 min-w-0 flex-1 rounded-field border border-line-strong bg-surface px-3 text-[15px] font-normal text-ink"
          />
          <button type="submit" disabled={pending} className={buttonClass("secondary", "h-11")}>
            Сохранить
          </button>
        </div>
      </label>
      {state.error ? <p className="text-[14px] font-semibold text-cancel">{state.error}</p> : null}
      {state.ok ? <p className="text-[14px] font-semibold text-add">Сохранено</p> : null}
    </form>
  );
}
