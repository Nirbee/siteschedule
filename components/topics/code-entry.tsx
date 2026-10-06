"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { enterCodeAction } from "@/app/(app)/topics/actions";
import { buttonClass } from "@/components/ui/button";

/**
 * «Введите код с экрана старосты». A QR code from that screen opens the page with ?code=…,
 * which is entered automatically (as an action, not on page load, so prefetches change nothing).
 */
export function CodeEntry({ listId, initialCode }: { listId: string; initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tried = useRef(false);

  const submit = (value: string) =>
    start(async () => {
      const result = await enterCodeAction(listId, value);
      if (result.ok) {
        setError(null);
        router.replace(`/topics/${listId}`);
      } else setError(result.error);
    });

  useEffect(() => {
    if (initialCode && !tried.current) {
      tried.current = true;
      submit(initialCode);
    }
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
      className="flex flex-col gap-2 rounded-card border-2 border-accent bg-surface p-[14px] md:p-[18px]"
    >
      <p className="flex items-center gap-2 font-bold">
        <KeyRound size={18} className="text-accent" aria-hidden /> Сейчас выбирают те, кто на паре
      </p>
      <p className="text-[14px] text-ink-2">
        Введите код с экрана старосты или отсканируйте QR-код — и выбирайте тему. Остальные смогут
        записаться, когда список откроют для всех.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="0000"
          aria-label="Код с экрана старосты"
          className="h-12 w-32 rounded-field border border-line-strong bg-surface px-3 text-center font-mono text-[22px] tracking-[0.3em] text-ink"
        />
        <button
          type="submit"
          disabled={pending || code.length !== 4}
          className={buttonClass("primary", "h-12 flex-1")}
        >
          {pending ? "Проверяем…" : "Войти"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[14px] font-semibold text-cancel">
          {error}
        </p>
      ) : null}
    </form>
  );
}
