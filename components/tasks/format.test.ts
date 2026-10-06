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

describe("numberedItems", () => {
  it("keeps the numbers and the heading of questions pasted from the chat", async () => {
    const { numberedItems } = await import("./format");
    expect(
      numberedItems(
        "Вопросы к РК1 по ЗИС:\n\n1. Определение информации.\n2. Определение ИС,\nпримеры.\n13. Уметь категорировать АС",
      ),
    ).toEqual({
      intro: ["Вопросы к РК1 по ЗИС:"],
      items: [
        { n: 1, text: "Определение информации." },
        { n: 2, text: "Определение ИС, примеры." },
        { n: 13, text: "Уметь категорировать АС" },
      ],
    });
    expect(numberedItems("Алгоритмы на графах\nБулевы функции")).toBeNull();
    expect(numberedItems("1. Одна строка")).toBeNull();
  });
});
