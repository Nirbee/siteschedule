"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Upload, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { ACCEPTED_EXTENSIONS } from "@/lib/ingest/detect";
import type { UploadResponse, UploadTarget } from "@/lib/ingest/upload-target";
import { KIND_LABELS, shortDate } from "@/lib/schedule/format";
import type { LessonKind } from "@/lib/schedule/types";
import { formatBytes } from "./format";

export interface UploadLessonOption {
  key: string;
  subjectId: string;
  subjectName: string;
  date: string;
  slotN: number | null;
  start: string;
  kind: LessonKind;
}

interface Props {
  lessons: UploadLessonOption[];
  subjects: { id: string; name: string }[];
  defaultLessonKey: string | null;
  /** On a subject page: preselect that subject. */
  subjectId?: string;
  label?: string;
  /** Secondary look inside forms, where another button is the main one. */
  secondary?: boolean;
}

type Item = {
  id: number;
  file: File;
  progress: number;
  state: "waiting" | "uploading" | "done" | "duplicate" | "error";
  error?: string;
};

// image/* lets iPhones convert HEIC to JPEG on the fly; documents are listed by extension.
const ACCEPT = ["image/*", ...ACCEPTED_EXTENSIONS.map((e) => `.${e}`)].join(",");
const PARALLEL = 2;

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";

export function UploadSheet({
  lessons,
  subjects,
  defaultLessonKey,
  subjectId,
  label,
  secondary = false,
}: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const subjectLessons = subjectId ? lessons.filter((l) => l.subjectId === subjectId) : lessons;
  const initialLesson =
    subjectLessons.find((l) => l.key === defaultLessonKey)?.key ?? subjectLessons[0]?.key ?? "";

  const [mode, setMode] = useState<"lesson" | "materials">(initialLesson ? "lesson" : "materials");
  const [lessonKey, setLessonKey] = useState(initialLesson);
  const [materialSubject, setMaterialSubject] = useState(subjectId ?? subjects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => i.state === "waiting" || i.state === "uploading");

  const lesson = lessons.find((l) => l.key === lessonKey);
  const target: UploadTarget | null =
    mode === "lesson"
      ? lesson
        ? {
            type: "lesson",
            subjectId: lesson.subjectId,
            date: lesson.date,
            slotN: lesson.slotN,
            startsAt: lesson.slotN === null ? lesson.start : null,
            kind: lesson.kind,
            ...(title.trim() ? { title: title.trim() } : {}),
          }
        : null
      : materialSubject
        ? { type: "materials", subjectId: materialSubject }
        : null;

  const update = (id: number, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  function send(item: Item, to: UploadTarget): Promise<void> {
    return new Promise((resolve) => {
      const body = new FormData();
      body.append("file", item.file);
      body.append("target", JSON.stringify(to));
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) update(item.id, { progress: e.loaded / e.total });
      };
      xhr.onload = () => {
        let response: UploadResponse | null = null;
        try {
          response = JSON.parse(xhr.responseText) as UploadResponse;
        } catch {
          // not JSON — handled below
        }
        if (response?.status === "created") update(item.id, { state: "done", progress: 1 });
        else if (response?.status === "duplicate")
          update(item.id, { state: "duplicate", progress: 1 });
        else
          update(item.id, {
            state: "error",
            error: response?.status === "rejected" ? response.error : "Ошибка загрузки",
          });
        resolve();
      };
      xhr.onerror = () => {
        update(item.id, { state: "error", error: "Нет соединения" });
        resolve();
      };
      update(item.id, { state: "uploading" });
      xhr.send(body);
    });
  }

  async function start(files: FileList) {
    if (!target || files.length === 0) return;
    const fresh: Item[] = [...files].map((file, i) => ({
      id: Date.now() + i,
      file,
      progress: 0,
      state: "waiting",
    }));
    setItems((list) => [...list, ...fresh]);
    const queue = [...fresh];
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await send(next, target);
      }),
    );
    router.refresh();
  }

  // Don't lose an upload in progress by accidentally closing the tab.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const doneCount = items.filter((i) => i.state === "done" || i.state === "duplicate").length;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={buttonClass(secondary ? "secondary" : "primary", secondary ? "self-start" : "")}
      >
        <Upload size={20} aria-hidden /> {label ?? "Загрузить"}
      </button>

      <dialog
        ref={dialog}
        onClose={() => !busy && setItems([])}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[20px] bg-surface p-0 text-ink backdrop:bg-viewer/60 md:m-auto md:max-w-lg md:rounded-[20px]"
      >
        <div className="flex flex-col gap-4 p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[20px] font-bold">Загрузка</h2>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => dialog.current?.close()}
              className="flex size-11 items-center justify-center rounded-field hover:bg-chip"
            >
              <X size={22} />
            </button>
          </div>

          <div role="radiogroup" className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-bg p-1">
            {(
              [
                ["lesson", "К паре"],
                ["materials", "В материалы"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`h-11 rounded-[10px] text-[14px] ${
                  mode === value ? "bg-emph font-bold text-on-emph" : "font-semibold text-ink-2"
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          {mode === "lesson" ? (
            subjectLessons.length ? (
              <>
                <label className={labelClass}>
                  Пара
                  <select
                    className={field}
                    value={lessonKey}
                    onChange={(e) => setLessonKey(e.target.value)}
                  >
                    {subjectLessons.map((l) => (
                      <option key={l.key} value={l.key}>
                        {shortDate(l.date)} · {l.start} · {l.subjectName} (
                        {KIND_LABELS[l.kind].toLowerCase()})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Тема занятия (если знаете)
                  <input
                    className={field}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    placeholder="Необязательно"
                  />
                </label>
              </>
            ) : (
              <p className="rounded-[12px] bg-surface-muted p-3 text-[14px] text-ink-2">
                За последнюю неделю пар {subjectId ? "по этому предмету " : ""}не было — загрузите
                файлы в материалы.
              </p>
            )
          ) : (
            <label className={labelClass}>
              Дисциплина
              <select
                className={field}
                value={materialSubject}
                onChange={(e) => setMaterialSubject(e.target.value)}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label
            className={`${buttonClass("secondary", "w-full cursor-pointer")} ${
              target ? "" : "pointer-events-none opacity-50"
            }`}
          >
            Выбрать фото или файлы
            <input
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              disabled={!target}
              onChange={(e) => {
                if (e.target.files) void start(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <p className="-mt-2 text-[13px] text-muted">
            Фото до 15 МБ, документы (PDF, Word, PowerPoint, Excel, архивы, DjVu) до 50 МБ.
          </p>

          {items.length ? (
            <ul className="flex max-h-[30dvh] flex-col gap-1.5 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="rounded-[10px] bg-surface-muted px-3 py-2 text-[14px]">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                    <span className="shrink-0 text-[12px] text-muted">
                      {formatBytes(item.file.size)}
                    </span>
                    {item.state === "done" || item.state === "duplicate" ? (
                      <CheckCircle2 size={18} className="shrink-0 text-add" aria-label="Готово" />
                    ) : item.state === "error" ? (
                      <CircleAlert size={18} className="shrink-0 text-cancel" aria-label="Ошибка" />
                    ) : null}
                  </div>
                  {item.state === "uploading" || item.state === "waiting" ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chip">
                      <div
                        className="h-full rounded-full bg-accent-solid transition-[width]"
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                  ) : null}
                  {item.state === "duplicate" ? (
                    <p className="text-[12px] text-muted">Уже было загружено раньше</p>
                  ) : null}
                  {item.error ? <p className="text-[12px] text-cancel">{item.error}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {items.length && !busy ? (
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className={buttonClass("primary", "w-full")}
            >
              Готово · {doneCount} из {items.length}
            </button>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
