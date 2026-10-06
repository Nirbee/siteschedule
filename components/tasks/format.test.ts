import { describe, expect, it } from "vitest";
import { bodyLines, dueFull, dueTime } from "./format";

const slots = new Map([[2, { start: "10:10", end: "11:40" }]]);

describe("task format", () => {
  it("describes due points", () => {
    expect(dueTime({ date: "2026-10-07", slotN: 2, startsAt: null }, slots)).toBe(
      "к 2 паре · 10:10",
    );
    expect(dueTime({ date: "2026-10-07", slotN: null, startsAt: "18:00" }, slots)).toBe("к 18:00");
    expect(dueFull({ date: "2026-10-07", slotN: null, startsAt: null }, slots)).toBe("ср, 07.10");
  });

  it("splits the body into items", () => {
    expect(bodyLines("Прочитать главу 0\n- Кольцо классов вычетов\n\n2) Отношения\n")).toEqual([
      "Прочитать главу 0",
      "Кольцо классов вычетов",
      "Отношения",
    ]);
  });
});
