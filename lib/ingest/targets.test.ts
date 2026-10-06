import { describe, expect, it } from "vitest";
import type { ScheduleData } from "@/lib/schedule/types";
import { uploadLessons } from "./targets";

const G = "g12";
const data: ScheduleData = {
  semester: { startsOn: "2026-08-31", endsOn: "2026-12-27", firstWeekParity: "numerator" },
  slots: new Map([
    [5, { start: "15:55", end: "17:25" }],
    [6, { start: "17:35", end: "19:05" }],
  ]),
  subjects: new Map(
    [
      { id: "op", name: "Основы предпринимательства", shortName: null, teacher: null },
      { id: "mnp", name: "Методология научного познания", shortName: null, teacher: null },
    ].map((s) => [s.id, s]),
  ),
  entries: [
    {
      id: "e1",
      subjectId: "op",
      weekday: 3,
      slotN: 5,
      parity: "any",
      kind: "lecture",
      room: null,
      teacher: null,
      validFrom: null,
      validTo: null,
      groupIds: [G],
    },
    {
      id: "e2",
      subjectId: "mnp",
      weekday: 3,
      slotN: 6,
      parity: "any",
      kind: "lecture",
      room: null,
      teacher: null,
      validFrom: null,
      validTo: null,
      groupIds: [G],
    },
  ],
  changes: [],
};
const WED = "2026-09-30";

describe("uploadLessons", () => {
  it("defaults to the lesson in progress", () => {
    const { defaultKey } = uploadLessons(data, G, WED, "17:19");
    expect(defaultKey).toBe(`op|${WED}|5`);
  });

  it("right after a lesson ends it is still the default", () => {
    expect(uploadLessons(data, G, WED, "17:30").defaultKey).toBe(`op|${WED}|5`);
  });

  it("the next lesson takes over once it starts", () => {
    expect(uploadLessons(data, G, WED, "17:40").defaultKey).toBe(`mnp|${WED}|6`);
  });

  it("before the first lesson of the day, falls back to last week's latest", () => {
    const { lessons, defaultKey } = uploadLessons(data, G, WED, "09:00");
    expect(defaultKey).toBe("mnp|2026-09-23|6");
    expect(lessons.every((l) => l.date < WED)).toBe(true);
  });
});
