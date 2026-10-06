// Grading schemes (у каждого преподавателя своя) and the personal points tracker. Pure.
import { z } from "zod";
import type { IsoDate } from "@/lib/schedule/dates";
import { isoDate } from "@/lib/schedule/inputs";
import type { LessonKind } from "@/lib/schedule/types";

const title = z.string().trim().min(1, "Укажите название").max(80);
const points = z.number().min(0).max(1000);

export const gradingConfig = z.object({
  /** In order; a module covers lessons up to its `until` date (the last one — to the end). */
  modules: z
    .array(z.object({ title, until: isoDate.nullable(), min: points }))
    .min(1, "Нужен хотя бы один модуль")
    .max(8),
  /** Points per attended lesson of these kinds; null — attendance is not graded. */
  attendance: z
    .object({
      points: z.number().min(0).max(50),
      kinds: z.array(z.enum(["lecture", "seminar", "practice", "lab"])).min(1),
    })
    .nullable(),
  /** РК, individual tasks… — the student enters what they got. */
  items: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_-]{1,24}$/),
        title,
        module: z.number().int().min(0),
        max: points,
      }),
    )
    .max(40),
  /** Extra work for those short of points; a library file may be attached. */
  extras: z
    .array(
      z.object({
        title,
        text: z.string().trim().max(1000).default(""),
        max: points,
        mediaId: z.uuid().nullable().default(null),
      }),
    )
    .max(20)
    .default([]),
  /** Grade by total points, e.g. 60 → «Зачтено», 0 → «Не зачтено». */
  scale: z.array(z.object({ from: points, label: z.string().trim().min(1).max(40) })).min(1),
  total: points.default(100),
  teacherId: z.uuid().nullable().default(null),
  note: z.string().trim().max(1000).default(""),
});
export type GradingConfig = z.output<typeof gradingConfig>;
export type GradingConfigInput = z.input<typeof gradingConfig>;

export interface GradeLesson {
  date: IsoDate;
  slotN: number | null;
  start: string;
  kind: LessonKind;
}

export const attendanceKey = (l: GradeLesson) => `att:${l.date}|${l.slotN ?? `@${l.start}`}`;
export const itemKey = (key: string) => `item:${key}`;
export const adjustmentKey = (module: number) => `adj:${module}`;

/** The module a date belongs to. */
export function moduleOf(config: GradingConfig, date: IsoDate): number {
  const index = config.modules.findIndex((m) => m.until === null || date <= m.until);
  return index === -1 ? config.modules.length - 1 : index;
}

export interface ModuleResult {
  index: number;
  title: string;
  min: number;
  lessons: { lesson: GradeLesson; key: string; attended: boolean; future: boolean }[];
  attendancePoints: number;
  items: { key: string; title: string; max: number; value: number | null }[];
  adjustment: number;
  points: number;
  /** Points still possible: future lessons and items not entered yet. */
  reachable: number;
  /** «ok» — minimum reached; «possible» — can still be reached; «short» — not without extra work. */
  status: "ok" | "possible" | "short";
  missing: number;
}

export interface GradeResult {
  modules: ModuleResult[];
  total: number;
  max: number;
  grade: string;
  passed: boolean;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function computeGrades(
  config: GradingConfig,
  lessons: GradeLesson[],
  marks: Map<string, number>,
  today: IsoDate,
): GradeResult {
  const counted = (l: GradeLesson) => config.attendance?.kinds.includes(l.kind as never) ?? false;
  const modules = config.modules.map((m, index): ModuleResult => {
    const own = lessons
      .filter((l) => counted(l) && moduleOf(config, l.date) === index)
      .map((lesson) => ({
        lesson,
        key: attendanceKey(lesson),
        attended: (marks.get(attendanceKey(lesson)) ?? 0) > 0,
        future: lesson.date > today,
      }));
    const per = config.attendance?.points ?? 0;
    const attendancePoints = own.filter((l) => l.attended).length * per;
    const items = config.items
      .filter((i) => i.module === index)
      .map((i) => {
        const raw = marks.get(itemKey(i.key));
        return {
          key: i.key,
          title: i.title,
          max: i.max,
          value: raw === undefined ? null : Math.min(Math.max(raw, 0), i.max),
        };
      });
    const adjustment = Math.min(marks.get(adjustmentKey(index)) ?? 0, 0);
    const points = round(
      attendancePoints + items.reduce((s, i) => s + (i.value ?? 0), 0) + adjustment,
    );
    const reachable = round(
      own.filter((l) => l.future && !l.attended).length * per +
        items.filter((i) => i.value === null).reduce((s, i) => s + i.max, 0),
    );
    const missing = round(Math.max(0, m.min - points));
    return {
      index,
      title: m.title,
      min: m.min,
      lessons: own,
      attendancePoints,
      items,
      adjustment,
      points,
      reachable,
      status: missing === 0 ? "ok" : reachable >= missing ? "possible" : "short",
      missing,
    };
  });
  const total = round(modules.reduce((s, m) => s + m.points, 0));
  const scale = [...config.scale].sort((a, b) => b.from - a.from);
  const grade = scale.find((s) => total >= s.from)?.label ?? scale.at(-1)!.label;
  // «Не зачтено», «Неудовлетворительно» mean failing (\b does not work with Cyrillic).
  const failing = (label: string) => /^не[\s-]|^неуд/i.test(label);
  const passFrom = Math.min(...scale.filter((s) => !failing(s.label)).map((s) => s.from));
  return {
    modules,
    total,
    max: config.total,
    grade,
    passed: Number.isFinite(passFrom) ? total >= passFrom : false,
  };
}
