// zod schemas for topic forms; shared by server actions and services.
import { z } from "zod";
import { isoDate } from "@/lib/schedule/inputs";
import { moscowInstant } from "@/lib/schedule/dates";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не больше ${max} символов`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** «2026-10-06T20:00» from <input type="datetime-local">, Moscow time → Date; empty → null. */
export const moscowDateTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(v);
    if (!match) {
      ctx.addIssue({ code: "custom", message: "Некорректные дата и время" });
      return z.NEVER;
    }
    return moscowInstant(match[1]!, match[2]!);
  });

export const capacity = z.coerce
  .number()
  .int()
  .min(1, "Хотя бы один человек")
  .max(30, "Не больше 30 человек");

export const topicListInput = z.object({
  subjectId: z.uuid("Выберите дисциплину"),
  title: z.string().trim().min(1, "Укажите название").max(120),
  defaultCapacity: capacity,
  pickDeadline: moscowDateTime,
  rules: optionalText(2000),
});
export type TopicListInput = z.input<typeof topicListInput>;

export const topicInput = z.object({
  title: z.string().trim().min(1, "Укажите тему").max(300),
  details: optionalText(300),
  capacity,
  dueDate: isoDate
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  dueOrder: z.coerce
    .number()
    .int()
    .min(1)
    .max(99)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});
export type TopicInput = z.input<typeof topicInput>;

export const fullNameInput = z
  .string()
  .trim()
  .min(3, "Напишите фамилию и имя")
  .max(120)
  .regex(/^[\p{L}][\p{L}\s.'-]*$/u, "Только буквы, пробелы и дефис");
