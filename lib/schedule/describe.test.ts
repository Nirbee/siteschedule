import { describe, expect, it } from "vitest";
import { describeChange } from "./describe";
import { formatRoom, fromShortDate, onDay, plural, shortDate } from "./format";

const time = { start: "17:35", end: "19:05" };

describe("format", () => {
  it("dates", () => {
    expect(shortDate("2026-10-10")).toBe("сб, 10.10");
    expect(fromShortDate("2026-10-07")).toBe("со ср, 07.10");
    expect(fromShortDate("2026-10-05")).toBe("с пн, 05.10");
    expect(onDay("2026-10-06")).toBe("во вторник, 6 октября");
  });

  it("rooms", () => {
    expect(formatRoom("514")).toBe("ауд. 514");
    expect(formatRoom("395.2")).toBe("ауд. 395.2");
    expect(formatRoom("каф. ИУ8")).toBe("каф. ИУ8");
    expect(formatRoom(null)).toBeNull();
  });

  it("plurals", () => {
    expect(plural(1, "пара", "пары", "пар")).toBe("1 пара");
    expect(plural(3, "пара", "пары", "пар")).toBe("3 пары");
    expect(plural(5, "пара", "пары", "пар")).toBe("5 пар");
    expect(plural(11, "пара", "пары", "пар")).toBe("11 пар");
    expect(plural(22, "пара", "пары", "пар")).toBe("22 пары");
  });
});

describe("describeChange", () => {
  it("cancel", () => {
    expect(describeChange({ type: "cancel", subject: "Аудит ИБ", date: "2026-10-07", time })).toBe(
      "Пара «Аудит ИБ» в среду, 7 октября, в 17:35 отменена.",
    );
  });

  it("replace", () => {
    expect(
      describeChange({
        type: "replace",
        subject: "Аудит ИБ",
        newSubject: "Правовое обеспечение ИБ",
        date: "2026-10-07",
        time,
        newRoom: "210",
      }),
    ).toBe("В среду, 7 октября, в 17:35 вместо «Аудит ИБ» — «Правовое обеспечение ИБ», ауд. 210.");
  });

  it("room", () => {
    expect(
      describeChange({
        type: "room",
        subject: "ЗИС",
        date: "2026-10-05",
        time,
        oldRoom: "413ю",
        newRoom: "514",
      }),
    ).toBe("Пара «ЗИС» в понедельник, 5 октября, в 17:35 пройдёт в ауд. 514 вместо 413ю.");
  });

  it("move to another day", () => {
    expect(
      describeChange({
        type: "move",
        subject: "Аудит ИБ",
        date: "2026-10-07",
        time,
        newDate: "2026-10-10",
        newTime: { start: "10:00", end: "11:30" },
      }),
    ).toBe("Пара «Аудит ИБ» переносится со среды, 7 октября, 17:35 на субботу, 10 октября, 10:00.");
  });

  it("move within the day", () => {
    expect(
      describeChange({
        type: "move",
        subject: "МЛиТА",
        date: "2026-10-06",
        time,
        newDate: "2026-10-06",
        newTime: { start: "11:50", end: "13:20" },
        newRoom: "395",
      }),
    ).toBe("Пара «МЛиТА» во вторник, 6 октября переносится с 17:35 на 11:50, ауд. 395.");
  });

  it("add", () => {
    expect(
      describeChange({
        type: "add",
        newSubject: "Аудит ИБ",
        kind: "seminar",
        date: "2026-10-10",
        time: { start: "12:00", end: "13:30" },
      }),
    ).toBe("Дополнительная пара: «Аудит ИБ» (семинар) в субботу, 10 октября, 12:00–13:30.");
  });
});

describe("dayFlag", () => {
  const subject = { name: "Аудит ИБ", shortName: null };
  it("prefers moves, then extra lessons, then cancellations", async () => {
    const { dayFlag } = await import("./format");
    expect(dayFlag([{ status: "moved_out", subject, movedTo: { date: "2026-10-10" } }])).toEqual({
      text: "перенос → сб",
      tone: "move",
    });
    expect(dayFlag([{ status: "added", subject }])).toEqual({ text: "+ Аудит ИБ", tone: "add" });
    expect(
      dayFlag([
        { status: "cancelled", subject },
        { status: "normal", subject },
      ]),
    ).toEqual({ text: "отмена", tone: "cancel" });
    expect(dayFlag([{ status: "normal", subject }])).toBeNull();
  });
});
