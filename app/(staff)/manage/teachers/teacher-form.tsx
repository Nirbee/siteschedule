"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { shrinkImage } from "@/components/ui/shrink-image";
import { saveTeacherAction, type TeacherFormState } from "./actions";

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";

export interface TeacherInitial {
  id: string;
  fullName: string;
  email: string | null;
  note: string | null;
  hasPhoto: boolean;
  subjectIds: string[];
}

export function TeacherForm({
  subjects,
  initial,
}: {
  subjects: { id: string; name: string }[];
  initial?: TeacherInitial;
}) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(
    async (prev, formData) => {
      // The photo is shrunk on the phone: server actions take about 1 MB.
      const file = formData.get("photoFile");
      formData.delete("photoFile");
      if (file instanceof File && file.size > 0) {
        try {
          formData.set("photo", await shrinkImage(file, 1000), "photo.jpg");
        } catch {
          return { error: "Не удалось открыть фото" };
        }
      }
      return saveTeacherAction(prev, formData);
    },
    {},
  );
  const [preview, setPreview] = useState<string | null>(
    initial?.hasPhoto ? `/teachers/${initial.id}/photo` : null,
  );
  const input = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview / private photo
          <img src={preview} alt="" className="size-20 rounded-full object-cover" />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full bg-chip text-muted">
            <UserRound size={34} aria-hidden />
          </span>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={buttonClass("secondary")}
        >
          <Camera size={18} aria-hidden /> {preview ? "Другое фото" : "Фото"}
        </button>
        <input
          ref={input}
          name="photoFile"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPreview(URL.createObjectURL(file));
          }}
        />
      </div>
      <label className={labelClass}>
        ФИО
        <input
          name="fullName"
          defaultValue={initial?.fullName}
          required
          maxLength={120}
          placeholder="Шкодинский Сергей Валерьевич"
          className={field}
        />
      </label>
      <label className={labelClass}>
        Почта для связи
        <input
          name="email"
          type="email"
          inputMode="email"
          defaultValue={initial?.email ?? ""}
          placeholder="name@bmstu.ru"
          className={field}
        />
      </label>
      <label className={labelClass}>
        Заметка
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          placeholder="Необязательно: «в теме письма — группа и ФИО»"
          className="rounded-field border border-line-strong bg-surface p-3 text-[15px] leading-[1.45] text-ink"
        />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 text-[13px] font-bold text-ink-2">Дисциплины</legend>
        {subjects.map((s) => (
          <label key={s.id} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              name="subjectId"
              value={s.id}
              defaultChecked={initial?.subjectIds.includes(s.id)}
              className="size-5 accent-[var(--color-accent-solid)]"
            />
            {s.name}
          </label>
        ))}
      </fieldset>
      {state.error ? (
        <p role="alert" className="rounded-[12px] bg-cancel-bg p-3 font-semibold text-cancel">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
    </form>
  );
}
