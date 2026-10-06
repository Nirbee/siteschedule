import { describe, expect, it } from "vitest";
import {
  adjustmentKey,
  attendanceKey,
  computeGrades,
  gradingConfig,
  itemKey,
  moduleOf,
  type GradeLesson,
} from "./scheme";

// Основы предпринимательства by the slides: 2 points per lesson, РК 0–10, tasks 0–5,
// minimum 18 / 18 / 24, 60+ — «Зачтено».
const config = gradingConfig.parse({
  modules: [
    { title: "Модуль 1", until: "2026-10-11", min: 18 },
    { title: "Модуль 2", until: "2026-11-15", min: 18 },
    { title: "Модуль 3", until: null, min: 24 },
  ],
  attendance: { points: 2, kinds: ["lecture"] },
  items: [
    { key: "rk1", title: "РК 1", module: 0, max: 10 },
    { key: "t1", title: "Индивидуальное задание", module: 0, max: 5 },
    { key: "rk2", title: "РК 2", module: 1, max: 10 },
  ],
  scale: [
    { from: 85, label: "Зачтено" },
    { from: 60, label: "Зачтено" },
    { from: 0, label: "Не зачтено" },
  ],
});

const lecture = (date: string): GradeLesson => ({
  date,
  slotN: 5,
  start: "15:55",
  kind: "lecture",
});
// Wednesdays of module 1 and two of module 2; a seminar that does not count.
const lessons: GradeLesson[] = [
  ...["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07"].map(
    lecture,
  ),
  { date: "2026-09-03", slotN: 2, start: "10:10", kind: "seminar" },
  lecture("2026-10-14"),
  lecture("2026-10-21"),
];

describe("modules", () => {
  it("by the module's last date", () => {
    expect(moduleOf(config, "2026-10-11")).toBe(0);
    expect(moduleOf(config, "2026-10-12")).toBe(1);
    expect(moduleOf(config, "2026-12-20")).toBe(2);
  });
});

describe("computeGrades", () => {
  it("6 lectures × 2 + РК 8 = 20 (the slide's example), minimum reached", () => {
    const marks = new Map<string, number>([
      ...lessons.slice(0, 6).map((l) => [attendanceKey(l), 1] as const),
      [itemKey("rk1"), 8],
    ]);
    const result = computeGrades(config, lessons, marks, "2026-10-08");
    const m1 = result.modules[0]!;
    expect(m1.lessons).toHaveLength(6); // the seminar is not counted
    expect(m1).toMatchObject({ attendancePoints: 12, points: 20, status: "ok", missing: 0 });
    expect(m1.reachable).toBe(5); // the task is not entered yet
  });

  it("short of the minimum: can it still be reached?", () => {
    const marks = new Map<string, number>([
      [attendanceKey(lessons[0]!), 1],
      [attendanceKey(lessons[1]!), 1],
      [itemKey("rk1"), 6],
      [adjustmentKey(0), -2], // late twice
    ]);
    const early = computeGrades(config, lessons, marks, "2026-09-20");
    expect(early.modules[0]).toMatchObject({ points: 8, missing: 10, status: "possible" });
    const late = computeGrades(config, lessons, marks, "2026-10-10");
    expect(late.modules[0]).toMatchObject({
      points: 8,
      missing: 10,
      reachable: 5,
      status: "short",
    });
  });

  it("clamps entered points and gives the grade by the scale", () => {
    const marks = new Map<string, number>([
      [itemKey("rk1"), 15],
      [itemKey("rk2"), -3],
      [adjustmentKey(1), 4], // a bonus is not a penalty: ignored
    ]);
    const result = computeGrades(config, [], marks, "2026-12-01");
    expect(result.modules.map((m) => m.points)).toEqual([10, 0, 0]);
    expect(result).toMatchObject({ total: 10, grade: "Не зачтено", passed: false, max: 100 });

    const pass = computeGrades(
      {
        ...config,
        modules: [{ title: "Всё", until: null, min: 0 }],
        items: [{ key: "rk1", title: "РК", module: 0, max: 70 }],
      },
      [],
      new Map([[itemKey("rk1"), 65]]),
      "2026-12-01",
    );
    expect(pass).toMatchObject({ total: 65, grade: "Зачтено", passed: true });
  });
});
