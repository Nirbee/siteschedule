import { describe, expect, it } from "vitest";
import type { EntryInfo, ScheduleData } from "@/lib/schedule/types";
import {
  batches,
  decideBatch,
  normalize,
  textSubject,
  timeLesson,
  type SortContext,
  type SortItem,
} from "./sort";

const G = "g12";
const WED = "2026-10-07";
/** Moscow wall-clock time on Wednesday 07.10.2026 (UTC+3). */
const msk = (hhmm: string, date = WED) => new Date(`${date}T${hhmm}:00+03:00`);

const entry = (o: Pick<EntryInfo, "id" | "subjectId" | "slotN">): EntryInfo => ({
  weekday: 3,
  parity: "any",
  kind: "seminar",
  room: null,
  teacher: null,
  validFrom: null,
  validTo: null,
  groupIds: [G],
  ...o,
});

const data: ScheduleData = {
  semester: { startsOn: "2026-08-31", endsOn: "2026-12-27", firstWeekParity: "numerator" },
  slots: new Map([
    [2, { start: "10:10", end: "11:40" }],
    [3, { start: "11:50", end: "13:20" }],
  ]),
  subjects: new Map(
    [
      { id: "zis", name: "Защищённые информационные системы", shortName: "ЗИС", teacher: null },
      { id: "mlita", name: "Математическая логика", shortName: "МЛиТА", teacher: null },
    ].map((s) => [s.id, s]),
  ),
  entries: [
    entry({ id: "e1", subjectId: "zis", slotN: 2 }),
    entry({ id: "e2", subjectId: "mlita", slotN: 3 }),
  ],
  changes: [],
};

const ctx: SortContext = {
  data,
  groupIds: [G],
  subjects: [
    { id: "zis", name: "Защищённые информационные системы", shortName: "ЗИС", aliases: [] },
    { id: "mlita", name: "Математическая логика", shortName: "МЛиТА", aliases: ["логика"] },
  ],
};

const item = (o: Partial<SortItem> & Pick<SortItem, "postedAt">): SortItem => ({
  kind: "photo",
  caption: "",
  fileName: "photo.jpg",
  authorId: 1,
  mediaGroupId: null,
  ...o,
});

describe("text signal", () => {
  it("normalizes", () => {
    expect(normalize("Вопросы к РК1 по ЗИС, ёлки!")).toBe("вопросы к рк1 по зис елки");
  });

  it("finds exactly one subject by short name, name or alias", () => {
    expect(textSubject("Вопросы к РК1 по ЗИС", ctx.subjects)).toBe("zis");
    expect(textSubject("Логика: прочитать главу 0", ctx.subjects)).toBe("mlita");
    expect(textSubject("Млита_задачи.pdf", ctx.subjects)).toBe("mlita");
    expect(textSubject("ЗИС и логика", ctx.subjects)).toBeNull(); // two subjects
    expect(textSubject("зиспользовать", ctx.subjects)).toBeNull(); // not a whole word
    expect(textSubject("", ctx.subjects)).toBeNull();
  });
});

describe("time signal", () => {
  it("during a lesson and up to 30 minutes after it", () => {
    expect(timeLesson(data, msk("10:30"), [G])).toMatchObject({ subjectId: "zis", slotN: 2 });
    expect(timeLesson(data, msk("11:45"), [G])).toMatchObject({ subjectId: "zis" });
    // 11:55: right after ЗИС and already during МЛиТА — the current lesson wins.
    expect(timeLesson(data, msk("11:55"), [G])).toMatchObject({ subjectId: "mlita" });
    expect(timeLesson(data, msk("14:30"), [G])).toBeNull();
    expect(timeLesson(data, msk("10:30", "2026-10-08"), [G])).toBeNull(); // Thursday
  });
});

describe("batches", () => {
  it("joins an album and one author's messages up to 2 minutes apart", () => {
    const items = [
      item({ postedAt: msk("10:30"), authorId: 1 }),
      item({ postedAt: msk("10:31"), authorId: 1 }),
      item({ postedAt: msk("10:31"), authorId: 2 }),
      item({ postedAt: msk("10:40"), authorId: 1 }),
      item({ postedAt: msk("10:45"), authorId: 1, mediaGroupId: "a" }),
      item({ postedAt: msk("10:50"), authorId: 1, mediaGroupId: "a" }),
    ];
    expect(batches(items)).toEqual([[0, 1], [2], [3], [4, 5]]);
  });
});

describe("decideBatch", () => {
  it("photo during a lesson → that lesson", () => {
    const [d] = decideBatch([item({ postedAt: msk("10:30") })], ctx);
    expect(d).toMatchObject({ status: "sorted", lesson: { subjectId: "zis", slotN: 2 } });
  });

  it("the caption of one photo applies to the whole batch", () => {
    const decisions = decideBatch(
      [item({ postedAt: msk("10:30"), caption: "МЛиТА доска" }), item({ postedAt: msk("10:31") })],
      ctx,
    );
    expect(decisions.map((d) => d.status)).toEqual(["unsorted", "unsorted"]);
    expect(decisions[1]).toMatchObject({ reason: expect.stringContaining("по подписи") });
  });

  it("photo in the evening → unsorted, hint: the last lesson of the day", () => {
    const [d] = decideBatch([item({ postedAt: msk("19:00") })], ctx);
    expect(d).toEqual({
      status: "unsorted",
      suggestion: { subjectId: "mlita", date: WED, slotN: 3 },
      reason: "после пары",
    });
  });

  it("files: text + time → lesson; text only → materials; time only → unsorted", () => {
    const file = (o: Partial<SortItem> & Pick<SortItem, "postedAt">) =>
      item({ kind: "file", fileName: "doc.pdf", ...o });
    expect(
      decideBatch([file({ postedAt: msk("10:30"), fileName: "ЗИС_лекция.pdf" })], ctx)[0],
    ).toMatchObject({ status: "sorted", lesson: { subjectId: "zis" } });
    expect(
      decideBatch([file({ postedAt: msk("20:00"), caption: "Вопросы к РК1 по ЗИС" })], ctx)[0],
    ).toEqual({ status: "sorted", materialsOf: "zis" });
    expect(decideBatch([file({ postedAt: msk("10:30") })], ctx)[0]).toMatchObject({
      status: "unsorted",
      suggestion: { subjectId: "zis", date: WED, slotN: 2 },
    });
  });
});

describe("forReview", () => {
  it("turns automatic decisions into hints for announcement topics", async () => {
    const { forReview } = await import("./sort");
    const [inLesson] = decideBatch([item({ postedAt: msk("10:30") })], ctx);
    expect(forReview(inLesson!)).toEqual({
      status: "unsorted",
      suggestion: { subjectId: "zis", date: WED, slotN: 2 },
      reason: "из топика объявлений, выложено во время пары",
    });
    expect(forReview({ status: "sorted", materialsOf: "zis" })).toMatchObject({
      status: "unsorted",
      suggestion: { subjectId: "zis", date: null, slotN: null },
    });
  });
});
