"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { createTopicListAction, type FormState } from "../actions";
import { TopicsField } from "../topics-field";

export function NewListForm({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTopicListAction, {});
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      {children}
      <TopicsField />
      {state.error ? (
        <p role="alert" className="rounded-[12px] bg-cancel-bg p-3 font-semibold text-cancel">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
        {pending ? "Создаём…" : "Создать список"}
      </button>
      <p className="text-[13px] text-muted">
        Студенты увидят список, когда вы откроете его для присутствующих или для всех.
      </p>
    </form>
  );
}
