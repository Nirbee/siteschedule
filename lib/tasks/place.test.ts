import { describe, expect, it } from "vitest";
import { resolveDay } from "@/lib/schedule/resolve";
import type { ChangeInfo, EntryInfo, ScheduleData } from "@/lib/schedule/types";
import { attachToLessons, nextLessonDue, placeDue, subjectLessons, untilLabel } from "./place";

// Autumn 2026: week 1 = Mon 31.08 (numerator); 05.10 is week 6 (denominator).
const G = "g12";
const MON = "2026-10-05";
const TUE = "2026-10-06";
const WED = "2026-10-07";
const THU = "2026-10-08";
const NEXT_WED = "2026-10-14";

const entry = (o: Partial<EntryInfo> & Pick<EntryInfo, "id" | "subjectId" | "weekday" | "slotN">) =>
  ({
    parity: "any",
    kind: "seminar",
    room: null,
    teacher: null,
    validFrom: null,
    validTo: null,
    groupIds: [G],
    ...o,
  }) satisfies EntryInfo;

let seq = 0;
const change = (o: Partial<ChangeInfo> & Pick<ChangeInfo, "type" | "date">): ChangeInfo => ({
  id: `c${++seq}`,
  entryId: null,
  slotN: null,
  startsAt: null,
  endsAt: null,
  newSubjectId: null,
  newKind: null,
  newRoom: null,
  newTeacher: null,
  newDate: null,
  newSlotN: null,
  newStartsAt: null,
  newEndsAt: null,
  comment: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  revokedAt: null,
  groupIds: [G],
  ...o,
});

function data(changes: ChangeInfo[] = []): ScheduleData {
  return {
    semester: { startsOn: "2026-08-31", endsOn: "2026-12-27", firstWeekParity: "numerator" },
    slots: new Map([
      [2, { start: "10:10", end: "11:40" }],
      [3, { start: "11:50", end: "13:20" }],
      [5, { start: "15:55", end: "17:25" }],
    ]),
    subjects: new Map(
      [
        { id: "logic", name: "Логика", shortName: null, teacher: null },
        { id: "law", name: "Право", shortName: null, teacher: null },
      ].map((s) => [s.id, s]),
    ),
    entries: [
      entry({ id: "logic-wed", subjectId: "logic", weekday: 3, slotN: 2 }),
      entry({ id: "logic-wed-2", subjectId: "logic", weekday: 3, slotN: 3, kind: "lecture" }),
      entry({ id: "law-thu", subjectId: "law", weekday: 4, slotN: 5 }),
    ],
    changes,
  };
}

describe("nextLessonDue", () => {
  it("is the first lesson of the subject after today", () => {
    expect(nextLessonDue(data(), G, "logic", MON)).toEqual({
      date: WED,
      slotN: 2,
      startsAt: null,
    });
    // On the lesson day itself, homework goes to the next week.
    expect(nextLessonDue(data(), G, "logic", WED)?.date).toBe(NEXT_WED);
  });

  it("skips cancelled lessons and follows custom-time additions", () => {
    const d = data([
      change({ type: "cancel", date: WED, entryId: "logic-wed" }),
      change({ type: "cancel", date: WED, entryId: "logic-wed-2" }),
      change({
        type: "add",
        date: TUE,
        startsAt: "18:00",
        endsAt: "19:30",
        newSubjectId: "logic",
        newKind: "seminar",
      }),
    ]);
    expect(nextLessonDue(d, G, "logic", MON)).toEqual({
      date: TUE,
      slotN: null,
      startsAt: "18:00",
    });
  });

  it("is null when the subject has no lessons ahead", () => {
    expect(nextLessonDue(data(), G, "nothing", MON)).toBeNull();
  });
});

describe("placeDue", () => {
  it("moves homework together with a moved lesson", () => {
    const d = data([
      change({ type: "move", date: WED, entryId: "logic-wed", newDate: THU, newSlotN: 3 }),
    ]);
    expect(placeDue(d, G, "logic", { date: WED, slotN: 2, startsAt: null })).toEqual({
      date: THU,
      slotN: 3,
      startsAt: null,
      moved: true,
    });
  });

  it("keeps the due point otherwise", () => {
    const due = { date: WED, slotN: 2, startsAt: null };
    expect(placeDue(data(), G, "logic", due)).toEqual({ ...due, moved: false });
    const dateOnly = { date: WED, slotN: null, startsAt: null };
    expect(placeDue(data(), G, "logic", dateOnly)).toEqual({ ...dateOnly, moved: false });
  });
});

describe("attachToLessons", () => {
  const item = (subjectId: string, slotN: number | null, date = WED) => ({
    subjectId,
    due: { date, slotN, startsAt: null },
  });

  it("puts homework on its lesson, date-only homework on the first lesson of the subject", () => {
    const lessons = resolveDay(data(), WED, G);
    const bySlot = item("logic", 3);
    const byDate = item("logic", null);
    const other = item("law", null);
    const { byLesson, dayLevel } = attachToLessons(lessons, [bySlot, byDate, other]);
    expect(byLesson.get(0)).toEqual([byDate]);
    expect(byLesson.get(1)).toEqual([bySlot]);
    expect(dayLevel).toEqual([other]);
  });

  it("does not attach to a cancelled lesson", () => {
    const d = data([change({ type: "cancel", date: WED, entryId: "logic-wed" })]);
    const { byLesson, dayLevel } = attachToLessons(resolveDay(d, WED, G), [item("logic", 2)]);
    expect(byLesson.size).toBe(0);
    expect(dayLevel).toHaveLength(1);
  });

  it("a replaced lesson belongs to the new subject", () => {
    const d = data([
      change({ type: "replace", date: WED, entryId: "logic-wed", newSubjectId: "law" }),
    ]);
    const lessons = resolveDay(d, WED, G);
    const { byLesson } = attachToLessons(lessons, [item("law", 2), item("logic", 2)]);
    expect(byLesson.get(0)?.map((i) => i.subjectId)).toEqual(["law"]);
  });
});

describe("subjectLessons", () => {
  it("lists upcoming lessons of a subject", () => {
    const lessons = subjectLessons(data(), G, "logic", MON, 14);
    expect(lessons.map((l) => `${l.date} ${l.slotN}`)).toEqual([
      `${WED} 2`,
      `${WED} 3`,
      `${NEXT_WED} 2`,
      `${NEXT_WED} 3`,
    ]);
  });
});

describe("untilLabel", () => {
  it("speaks Russian", () => {
    expect(untilLabel(MON, MON)).toBe("сегодня");
    expect(untilLabel(MON, TUE)).toBe("завтра");
    expect(untilLabel(MON, THU)).toBe("через 3 дня");
    expect(untilLabel(MON, "2026-10-26")).toBe("через 21 день");
    expect(untilLabel(MON, "2026-10-16")).toBe("через 11 дней");
    expect(untilLabel(TUE, MON)).toBe("вчера");
    expect(untilLabel(THU, MON)).toBe("3 дня назад");
  });
});

describe("tasksOfDay", () => {
  it("puts a control event on the lesson at the same time", async () => {
    const { tasksOfDay } = await import("./place");
    const lessons = resolveDay(data(), WED, G);
    const exam = { id: "x", subjectId: "logic", date: WED, slotN: 3, startsAt: null };
    const custom = { id: "y", subjectId: "logic", date: WED, slotN: null, startsAt: "18:00" };
    const hw = { subjectId: "logic", due: { date: WED, slotN: 2, startsAt: null } };
    const other = { subjectId: "logic", due: { date: THU, slotN: null, startsAt: null } };
    const day = tasksOfDay(lessons, WED, [hw, other], [exam, custom]);
    expect(day.byLesson.get(0)).toEqual({ assignments: [hw], controls: [] });
    expect(day.byLesson.get(1)).toEqual({ assignments: [], controls: [exam] });
    expect(day.dayLevel).toEqual({ assignments: [], controls: [custom] });
  });
});
