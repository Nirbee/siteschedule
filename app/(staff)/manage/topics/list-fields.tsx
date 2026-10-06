import { toDateTimeInput } from "@/lib/time";

const field =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3 text-[15px] text-ink";
const labelClass = "flex flex-col gap-1.5 text-[13px] font-bold text-ink-2";

/** Fields shared by «новый список» and its settings. */
export function ListFields({
  subjects,
  initial,
}: {
  subjects: { id: string; name: string }[];
  initial?: {
    subjectId: string;
    title: string;
    defaultCapacity: number;
    pickDeadline: Date | null;
    rules: string | null;
  };
}) {
  return (
    <>
      <label className={labelClass}>
        Дисциплина
        <select name="subjectId" defaultValue={initial?.subjectId} className={field} required>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Название
        <input
          name="title"
          defaultValue={initial?.title ?? "Доклады"}
          maxLength={120}
          required
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Человек на тему
          <input
            name="defaultCapacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            defaultValue={initial?.defaultCapacity ?? 1}
            className={`${field} font-mono`}
          />
        </label>
        <label className={labelClass}>
          Выбрать до
          <input
            name="pickDeadline"
            type="datetime-local"
            defaultValue={toDateTimeInput(initial?.pickDeadline ?? null)}
            className={`${field} font-mono`}
          />
        </label>
      </div>
      <label className={labelClass}>
        Правила
        <textarea
          name="rules"
          rows={2}
          defaultValue={initial?.rules ?? ""}
          maxLength={2000}
          placeholder="Необязательно: требования к докладу, объём, как сдавать"
          className="rounded-field border border-line-strong bg-surface p-3 text-[15px] leading-[1.45] text-ink"
        />
      </label>
    </>
  );
}
