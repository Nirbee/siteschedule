"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { setDoneAction } from "@/app/(app)/tasks/actions";

/** «Сделано» checkbox; only the student sees their own mark. */
export function DoneToggle({ id, done }: { id: string; done: boolean }) {
  const [checked, setChecked] = useOptimistic(done);
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() =>
        startTransition(async () => {
          setChecked(!checked);
          await setDoneAction(id, !checked);
        })
      }
      className="-ml-1 inline-flex min-h-11 items-center gap-2.5 rounded-field px-1 text-[14px] font-semibold text-ink-2 hover:text-ink"
    >
      <span
        className={`flex size-6 items-center justify-center rounded-[7px] border-2 ${
          checked ? "border-add bg-add text-surface" : "border-line-strong bg-surface"
        }`}
      >
        {checked ? <Check size={16} strokeWidth={3} aria-hidden /> : null}
      </span>
      {checked ? "Сделано" : "Отметить, что сделано"}
    </button>
  );
}
