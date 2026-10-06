"use client";

import { useState } from "react";
import { ExternalLink, FileText, Images, Link2, X } from "lucide-react";
import { optionLabel } from "@/components/tasks/format";
import type { MaterialOption } from "@/lib/services/tasks";
import type { ChosenMaterial } from "./form-types";

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";

/** Picks library files (optionally a page), lessons' notes and outside links. */
export function MaterialPicker({
  options,
  value,
  onChange,
}: {
  options: MaterialOption[];
  value: ChosenMaterial[];
  onChange: (next: ChosenMaterial[]) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const chosen = new Set(value.map((m) => m.key));
  const files = options.filter((o) => o.kind === "file" && !chosen.has(o.value));
  const notes = options.filter((o) => o.kind === "note" && !chosen.has(o.value));

  const addOption = (raw: string) => {
    const option = options.find((o) => o.value === raw);
    if (!option) return;
    const id = option.value.slice(2);
    onChange([
      ...value,
      {
        key: option.value,
        input: option.kind === "file" ? { mediaId: id, page: null } : { lessonNoteId: id },
        label: optionLabel(option),
        pageCount: option.pageCount,
      },
    ]);
  };

  const addLink = () => {
    const clean = url.trim();
    if (!/^https?:\/\/\S+$/i.test(clean)) return;
    onChange([
      ...value,
      {
        key: `u:${clean}`,
        input: { url: clean, title: title.trim() || null },
        label: title.trim() || clean,
        pageCount: null,
      },
    ]);
    setUrl("");
    setTitle("");
    setLinkOpen(false);
  };

  const setPage = (key: string, page: string) =>
    onChange(
      value.map((m) =>
        m.key === key && "mediaId" in m.input
          ? { ...m, input: { ...m.input, page: page ? Math.max(1, Number(page)) : null } }
          : m,
      ),
    );

  return (
    <div className="flex flex-col gap-2">
      {value.length ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((m) => {
            const Icon =
              "mediaId" in m.input ? FileText : "lessonNoteId" in m.input ? Images : ExternalLink;
            return (
              <li
                key={m.key}
                className="flex min-h-12 items-center gap-2 rounded-field border border-line bg-surface-muted py-1 pr-1 pl-3"
              >
                <Icon size={18} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                  {m.label}
                </span>
                {"mediaId" in m.input ? (
                  <label className="flex shrink-0 items-center gap-1 text-[13px] text-muted">
                    стр.
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={m.pageCount ?? undefined}
                      value={m.input.page ?? ""}
                      onChange={(e) => setPage(m.key, e.target.value)}
                      placeholder="—"
                      aria-label={`Страница в «${m.label}»`}
                      className="h-10 w-16 rounded-[8px] border border-line-strong bg-surface px-2 font-mono text-[14px] text-ink"
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.key !== m.key))}
                  aria-label={`Убрать «${m.label}»`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chip"
                >
                  <X size={18} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {files.length || notes.length ? (
        <select
          className={field}
          value=""
          onChange={(e) => addOption(e.target.value)}
          aria-label="Добавить из библиотеки"
        >
          <option value="">+ Добавить из библиотеки…</option>
          {files.length ? (
            <optgroup label="Файлы">
              {files.map((o) => (
                <option key={o.value} value={o.value}>
                  {optionLabel(o)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {notes.length ? (
            <optgroup label="Конспекты занятий">
              {notes.map((o) => (
                <option key={o.value} value={o.value}>
                  {optionLabel(o)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      ) : options.length === 0 ? (
        <p className="text-[14px] text-muted">
          В библиотеке по этой дисциплине пока нет файлов — загрузите их ниже.
        </p>
      ) : null}

      {linkOpen ? (
        <div className="flex flex-col gap-2 rounded-field border border-line p-3">
          <input
            type="url"
            inputMode="url"
            className={field}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            aria-label="Адрес ссылки"
          />
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название (необязательно)"
            aria-label="Название ссылки"
            maxLength={200}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addLink}
              disabled={!/^https?:\/\/\S+$/i.test(url.trim())}
              className="h-11 rounded-field bg-emph px-4 text-[14px] font-bold text-on-emph disabled:opacity-50"
            >
              Добавить ссылку
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="h-11 rounded-field px-4 text-[14px] font-semibold text-ink-2 hover:bg-chip"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLinkOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-[14px] font-semibold text-accent"
        >
          <Link2 size={16} aria-hidden /> Добавить ссылку
        </button>
      )}
    </div>
  );
}
