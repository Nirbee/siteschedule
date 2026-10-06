// zod schemas for homework and control-event forms; shared by server actions and services.
import { z } from "zod";
import { clockTime, isoDate, lessonTarget } from "@/lib/schedule/inputs";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не больше ${max} символов`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const materialInput = z.union([
  z.object({
    mediaId: z.uuid(),
    page: z.number().int().min(1).max(100_000).nullable().optional(),
  }),
  z.object({ lessonNoteId: z.uuid() }),
  z.object({
    url: z.url({ protocol: /^https?$/, error: "Ссылка должна начинаться с http:// или https://" }),
    title: optionalText(200),
  }),
]);
export type MaterialInput = z.input<typeof materialInput>;

const materials = z.array(materialInput).max(30, "Слишком много материалов").default([]);

export const dueInput = z
  .object({
    date: isoDate,
    slotN: z.number().int().min(1).max(12).nullable(),
    startsAt: clockTime.nullable(),
  })
  .refine((d) => d.slotN === null || d.startsAt === null, "Укажите либо пару, либо время");

export const assignmentInput = z.object({
  subjectId: z.uuid("Выберите дисциплину"),
  due: dueInput,
  body: z.string().trim().min(1, "Напишите, что задано").max(3000, "Слишком длинный текст"),
  materials,
});
export type AssignmentInput = z.input<typeof assignmentInput>;

export const controlEventInput = z.object({
  subjectId: z.uuid("Выберите дисциплину"),
  date: isoDate,
  target: lessonTarget,
  form: z.string().trim().min(1, "Укажите форму контроля").max(80),
  room: optionalText(40),
  topics: optionalText(3000),
  rules: optionalText(1000),
  admission: optionalText(1000),
  materials,
});
export type ControlEventInput = z.input<typeof controlEventInput>;

export const CONTROL_FORMS = [
  "Контрольная работа",
  "Рубежный контроль",
  "Тест",
  "Коллоквиум",
  "Защита",
  "Зачёт",
];
