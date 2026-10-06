// zod schemas for schedule forms; shared by server actions and services.
import { z } from "zod";
import { isIsoDate, isoWeekday } from "./dates";

export const isoDate = z.string().refine(isIsoDate, "Некорректная дата");
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");
export const lessonKind = z.enum(["lecture", "seminar", "practice", "lab", "self_study"]);
export const parity = z.enum(["any", "numerator", "denominator"]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Lesson time: a bell-grid slot or a custom range («другое время»). */
export const lessonTarget = z.union([
  z.object({ slotN: z.number().int().min(1).max(12) }),
  z
    .object({ startsAt: clockTime, endsAt: clockTime })
    .refine((t) => t.endsAt > t.startsAt, "Конец пары должен быть позже начала"),
]);
export type LessonTarget = z.infer<typeof lessonTarget>;

const common = {
  groupIds: z.array(z.uuid()).min(1, "Выберите хотя бы одну группу"),
  comment: optionalText(500),
};
const existing = { entryId: z.uuid(), date: isoDate };

export const changeInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cancel"), ...existing, ...common }),
  z.object({
    type: z.literal("replace"),
    ...existing,
    ...common,
    newSubjectId: z.uuid("Выберите, что будет вместо"),
    newKind: lessonKind.optional(),
    newRoom: optionalText(40),
  }),
  z.object({
    type: z.literal("room"),
    ...existing,
    ...common,
    newRoom: z.string().trim().min(1, "Укажите аудиторию").max(40),
  }),
  z.object({
    type: z.literal("move"),
    ...existing,
    ...common,
    newDate: isoDate,
    target: lessonTarget,
    newRoom: optionalText(40),
  }),
  z.object({
    type: z.literal("add"),
    date: isoDate,
    ...common,
    target: lessonTarget,
    newSubjectId: z.uuid("Выберите предмет"),
    newKind: lessonKind,
    newRoom: optionalText(40),
    newTeacher: optionalText(120),
  }),
]);
/** What callers pass (before trimming/defaults). */
export type ChangeInput = z.input<typeof changeInput>;

export const subjectInput = z.object({
  name: z.string().trim().min(1, "Укажите название").max(200),
  shortName: optionalText(40),
  teacher: optionalText(120),
  /** Comma-separated in the form. */
  aliases: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export const entryInput = z.object({
  subjectId: z.uuid("Выберите предмет"),
  weekday: z.coerce.number().int().min(1).max(7),
  slotN: z.coerce.number().int().min(1).max(12),
  parity,
  kind: lessonKind,
  room: optionalText(40),
  teacher: optionalText(120),
  groupIds: z.array(z.uuid()).min(1, "Выберите хотя бы одну группу"),
  validFrom: isoDate.optional().nullable(),
  validTo: isoDate.optional().nullable(),
});

export const semesterInput = z
  .object({
    title: z.string().trim().min(1).max(60),
    startsOn: isoDate,
    endsOn: isoDate,
    firstWeekParity: z.enum(["numerator", "denominator"]),
  })
  .refine((s) => s.endsOn > s.startsOn, {
    message: "Конец семестра раньше начала",
    path: ["endsOn"],
  })
  .refine((s) => isoWeekday(s.startsOn) === 1, {
    message: "Неделя 1 должна начинаться с понедельника",
    path: ["startsOn"],
  });
