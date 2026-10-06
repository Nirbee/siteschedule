"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { shrinkImage } from "@/components/ui/shrink-image";
import { parseTopics } from "@/lib/topics/parse";
import { recognizeTopicsAction } from "./actions";

const MAX_SIDE = 2200;

/**
 * Topics textarea: paste from Excel, type one per line, or photograph the printed sheet.
 * Shows how the text will be split into topics.
 */
export function TopicsField({ name = "topics" }: { name?: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const parsed = parseTopics(text);

  const recognize = (file: File) =>
    start(async () => {
      setError(null);
      try {
        const form = new FormData();
        form.append("photo", await shrinkImage(file, MAX_SIDE), "sheet.jpg");
        const result = await recognizeTopicsAction(form);
        if (result.text)
          setText((current) => (current.trim() ? `${current}\n${result.text}` : result.text!));
        else setError(result.error ?? "Не удалось распознать фото");
      } catch {
        setError("Не удалось открыть фото");
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink-2">Темы</span>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-field px-2 text-[14px] font-semibold text-accent disabled:opacity-50"
        >
          <Camera size={18} aria-hidden /> {pending ? "Распознаём…" : "Сфотографировать лист"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) recognize(file);
            e.target.value = "";
          }}
        />
      </div>
      <textarea
        name={name}
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="rounded-field border border-line-strong bg-surface p-3 text-[15px] leading-[1.45] text-ink"
        placeholder={
          "Вставьте строки из Excel (№, тема, подтема) или по одной теме на строку:\n1. Государственная тайна. Служебная тайна\n2. Лицензирование в области ИБ"
        }
      />
      {error ? <p className="text-[14px] font-semibold text-cancel">{error}</p> : null}
      {parsed.length ? (
        <details className="rounded-field bg-surface-muted p-3 text-[14px]">
          <summary className="cursor-pointer font-semibold text-ink-2">
            Получится тем: {parsed.length} — проверить
          </summary>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-6 text-ink">
            {parsed.map((t, i) => (
              <li key={i}>
                {t.title}
                {t.details ? <span className="text-muted"> — {t.details}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
