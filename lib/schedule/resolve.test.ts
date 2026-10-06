import { describe, expect, it } from "vitest";
import { addDays, isoWeekday, mondayOf, todayInMoscow } from "./dates";
import { resolveDay, resolveWeek, summarizeDay } from "./resolve";
import type { ChangeInfo, EntryInfo, ScheduleData } from "./types";
import { weekInfo } from "./week";

// Semester like autumn 2026: week 1 = Mon 31.08 (numerator).
const G11 = "g11";
const G12 = "g12";
const BOTH = [G11, G12];

const MON_W6 = "2026-10-05"; // week 6, denominator
const WED_W6 = "2026-10-07";
const SAT_W6 = "2026-10-10";
const MON_W7 = "2026-10-12"; // week 7, numerator

function entry(overrides: Partial<EntryInfo> & Pick<EntryInfo, "id" | "subjectId">): EntryInfo {
  return {
    weekday: 1,
    slotN: 6,
    parity: "any",
    kind: "lecture",
    room: "514",
    teacher: null,
    validFrom: null,
    validTo: null,
    groupIds: BOTH,
    ...overrides,
  };
}

let changeSeq = 0;
function change(overrides: Partial<ChangeInfo> & Pick<ChangeInfo, "type" | "date">): ChangeInfo {
  changeSeq += 1;
  return {
    id: `c${changeSeq}`,
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
    createdAt: new Date(`2026-10-01T10:00:${String(changeSeq % 60).padStart(2, "0")}Z`),
    revokedAt: null,
    groupIds: BOTH,
    ...overrides,
  };
}

function data(entries: EntryInfo[], changes: ChangeInfo[] = []): ScheduleData {
  return {
    semester: { startsOn: "2026-08-31", endsOn: "2026-12-27", firstWeekParity: "numerator" },
    slots: new Map([
      [2, { start: "10:10", end: "11:40" }],
      [3, { start: "11:50", end: "13:20" }],
      [5, { start: "15:55", end: "17:25" }],
      [6, { start: "17:35", end: "19:05" }],
      [7, { start: "19:15", end: "20:45" }],
    ]),
    subjects: new Map(
      [
        {
          id: "zis",
          name: "Защищённые информационные системы",
          shortName: "ЗИС",
          teacher: "Т. ЗИС",
        },
        { id: "opo", name: "Орг.-правовое обеспечение ИБ", shortName: "ОПО ИБ", teacher: null },
        { id: "audit", name: "Аудит ИБ", shortName: null, teacher: null },
        { id: "self", name: "Самостоятельная работа", shortName: null, teacher: null },
      ].map((s) => [s.id, s]),
    ),
    entries,
    changes,
  };
}

const names = (lessons: ReturnType<typeof resolveDay>) =>
  lessons.map((l) => `${l.time.start} ${l.subject.id} ${l.status}`);

describe("dates", () => {
  it("weekday and monday helpers", () => {
    expect(isoWeekday(MON_W6)).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
    expect(mondayOf(SAT_W6)).toBe(MON_W6);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("today follows the Moscow calendar", () => {
    expect(todayInMoscow(new Date("2026-10-05T21:30:00Z"))).toBe("2026-10-06"); // 00:30 MSK
    expect(todayInMoscow(new Date("2026-10-05T20:30:00Z"))).toBe("2026-10-05"); // 23:30 MSK
  });
});

describe("weekInfo", () => {
  const sem = data([]).semester;
  it("05.10.2026 is week 6, denominator (matches the BMSTU app)", () => {
    expect(weekInfo(sem, MON_W6)).toEqual({ number: 6, parity: "denominator" });
    expect(weekInfo(sem, "2026-10-17")).toEqual({ number: 7, parity: "numerator" });
    expect(weekInfo(sem, "2026-08-31")).toEqual({ number: 1, parity: "numerator" });
  });

  it("is null outside the semester", () => {
    expect(weekInfo(sem, "2026-08-30")).toBeNull();
    expect(weekInfo(sem, "2026-12-28")).toBeNull();
  });
});

describe("base schedule", () => {
  const entries = [
    entry({ id: "e1", subjectId: "zis", parity: "numerator" }),
    entry({ id: "e2", subjectId: "opo", parity: "denominator", room: "каф. ИУ8" }),
    entry({ id: "e3", subjectId: "zis", slotN: 7, kind: "seminar" }),
  ];

  it("numerator / denominator / any", () => {
    expect(names(resolveDay(data(entries), MON_W6, G12))).toEqual([
      "17:35 opo normal",
      "19:15 zis normal",
    ]);
    expect(names(resolveDay(data(entries), MON_W7, G12))).toEqual([
      "17:35 zis normal",
      "19:15 zis normal",
    ]);
  });

  it("uses the subject's teacher unless the entry overrides it", () => {
    const [lesson] = resolveDay(data([entry({ id: "e", subjectId: "zis" })]), MON_W6, G12);
    expect(lesson?.teacher).toBe("Т. ЗИС");
  });

  it("respects valid_from / valid_to", () => {
    const limited = [
      entry({ id: "e", subjectId: "zis", validFrom: MON_W7, validTo: "2026-10-19" }),
    ];
    expect(resolveDay(data(limited), MON_W6, G12)).toEqual([]);
    expect(resolveDay(data(limited), MON_W7, G12)).toHaveLength(1);
    expect(resolveDay(data(limited), "2026-10-26", G12)).toEqual([]);
  });

  it("is empty outside the semester", () => {
    expect(resolveDay(data(entries), "2027-01-11", G12)).toEqual([]);
  });

  it("shows lessons only to their groups", () => {
    const only11 = [entry({ id: "e", subjectId: "zis", groupIds: [G11] })];
    expect(resolveDay(data(only11), MON_W6, G11)).toHaveLength(1);
    expect(resolveDay(data(only11), MON_W6, G12)).toEqual([]);
  });
});

describe("changes", () => {
  const base = entry({ id: "e1", subjectId: "audit", weekday: 3, slotN: 6, room: "305" });

  it("cancel keeps the lesson, crossed out", () => {
    const c = change({
      type: "cancel",
      date: WED_W6,
      entryId: "e1",
      comment: "Преподаватель болеет",
    });
    const [lesson] = resolveDay(data([base], [c]), WED_W6, G12);
    expect(lesson).toMatchObject({
      status: "cancelled",
      comment: "Преподаватель болеет",
      changeId: c.id,
    });
    expect(summarizeDay([lesson!])).toMatchObject({ lessons: 0, cancelled: 1 });
  });

  it("replace swaps subject and room, keeps the original", () => {
    const c = change({
      type: "replace",
      date: WED_W6,
      entryId: "e1",
      newSubjectId: "opo",
      newKind: "seminar",
      newRoom: "210",
    });
    const [lesson] = resolveDay(data([base], [c]), WED_W6, G12);
    expect(lesson).toMatchObject({
      status: "replaced",
      subject: { id: "opo" },
      kind: "seminar",
      room: "210",
      original: { subjectName: "Аудит ИБ", kind: "lecture", room: "305" },
    });
  });

  it("room change keeps the subject", () => {
    const c = change({ type: "room", date: WED_W6, entryId: "e1", newRoom: "210" });
    const [lesson] = resolveDay(data([base], [c]), WED_W6, G12);
    expect(lesson).toMatchObject({ status: "room_changed", subject: { id: "audit" }, room: "210" });
    expect(lesson?.original?.room).toBe("305");
  });

  it("a change applies only to the date it was made for", () => {
    const c = change({ type: "cancel", date: WED_W6, entryId: "e1" });
    expect(resolveDay(data([base], [c]), "2026-10-14", G12)[0]?.status).toBe("normal");
  });

  it("revoked changes are ignored", () => {
    const c = change({ type: "cancel", date: WED_W6, entryId: "e1", revokedAt: new Date() });
    expect(resolveDay(data([base], [c]), WED_W6, G12)[0]?.status).toBe("normal");
  });

  it("the latest of two changes wins", () => {
    const first = change({ type: "cancel", date: WED_W6, entryId: "e1" });
    const second = change({ type: "room", date: WED_W6, entryId: "e1", newRoom: "210" });
    expect(resolveDay(data([base], [second, first]), WED_W6, G12)[0]?.status).toBe("room_changed");
  });

  it("a change for one group is invisible to the other", () => {
    const c = change({ type: "cancel", date: WED_W6, entryId: "e1", groupIds: [G11] });
    expect(resolveDay(data([base], [c]), WED_W6, G11)[0]?.status).toBe("cancelled");
    expect(resolveDay(data([base], [c]), WED_W6, G12)[0]?.status).toBe("normal");
  });
});

describe("move", () => {
  const base = entry({ id: "e1", subjectId: "audit", weekday: 3, slotN: 6, room: "305" });
  const selfStudy = entry({
    id: "s",
    subjectId: "self",
    weekday: 6,
    slotN: 2,
    kind: "self_study",
    room: null,
  });

  it("to Saturday at a custom time: moved_out on the origin, moved_in on the target", () => {
    const c = change({
      type: "move",
      date: WED_W6,
      entryId: "e1",
      newDate: SAT_W6,
      newStartsAt: "10:00",
      newEndsAt: "11:30",
    });
    const d = data([base, selfStudy], [c]);

    const [out] = resolveDay(d, WED_W6, G12);
    expect(out).toMatchObject({
      status: "moved_out",
      movedTo: { date: SAT_W6, slotN: null, time: { start: "10:00", end: "11:30" } },
    });

    const saturday = resolveDay(d, SAT_W6, G12);
    expect(names(saturday)).toEqual(["10:00 audit moved_in", "10:10 self normal"]);
    expect(saturday[0]).toMatchObject({
      slotN: null,
      room: "305",
      movedFrom: { date: WED_W6, slotN: 6, time: { start: "17:35", end: "19:05" } },
    });
    // Overlapping self-study is not a conflict.
    expect(saturday.some((l) => l.conflict)).toBe(false);
  });

  it("to another slot of the same day", () => {
    const c = change({
      type: "move",
      date: WED_W6,
      entryId: "e1",
      newDate: WED_W6,
      newSlotN: 3,
      newRoom: "210",
    });
    expect(names(resolveDay(data([base], [c]), WED_W6, G12))).toEqual([
      "11:50 audit moved_in",
      "17:35 audit moved_out",
    ]);
  });

  it("disappears from the target when a later change overrides the move", () => {
    const move = change({
      type: "move",
      date: WED_W6,
      entryId: "e1",
      newDate: SAT_W6,
      newSlotN: 3,
    });
    const cancel = change({ type: "cancel", date: WED_W6, entryId: "e1" });
    const d = data([base], [move, cancel]);
    expect(resolveDay(d, SAT_W6, G12)).toEqual([]);
    expect(resolveDay(d, WED_W6, G12)[0]?.status).toBe("cancelled");
  });

  it("a revoked move puts the lesson back", () => {
    const move = change({
      type: "move",
      date: WED_W6,
      entryId: "e1",
      newDate: SAT_W6,
      newSlotN: 3,
      revokedAt: new Date(),
    });
    const d = data([base], [move]);
    expect(resolveDay(d, SAT_W6, G12)).toEqual([]);
    expect(resolveDay(d, WED_W6, G12)[0]?.status).toBe("normal");
  });
});

describe("add", () => {
  const base = entry({ id: "e1", subjectId: "zis", weekday: 1, slotN: 6 });

  it("into an empty slot", () => {
    const c = change({
      type: "add",
      date: MON_W6,
      slotN: 5,
      newSubjectId: "audit",
      newKind: "seminar",
      newRoom: "210",
    });
    const lessons = resolveDay(data([base], [c]), MON_W6, G12);
    expect(names(lessons)).toEqual(["15:55 audit added", "17:35 zis normal"]);
    expect(lessons.some((l) => l.conflict)).toBe(false);
    expect(summarizeDay(lessons)).toMatchObject({ lessons: 2, changed: 1 });
  });

  it("at a custom time", () => {
    const c = change({
      type: "add",
      date: SAT_W6,
      startsAt: "12:00",
      endsAt: "13:30",
      newSubjectId: "audit",
      newKind: "lecture",
    });
    const [lesson] = resolveDay(data([], [c]), SAT_W6, G12);
    expect(lesson).toMatchObject({
      status: "added",
      slotN: null,
      time: { start: "12:00", end: "13:30" },
    });
  });

  it("into an occupied slot marks a conflict", () => {
    const c = change({
      type: "add",
      date: MON_W6,
      slotN: 6,
      newSubjectId: "audit",
      newKind: "seminar",
    });
    const lessons = resolveDay(data([base], [c]), MON_W6, G12);
    expect(lessons.every((l) => l.conflict)).toBe(true);
  });

  it("over a cancelled lesson is not a conflict", () => {
    const cancel = change({ type: "cancel", date: MON_W6, entryId: "e1" });
    const add = change({
      type: "add",
      date: MON_W6,
      slotN: 6,
      newSubjectId: "audit",
      newKind: "seminar",
    });
    const lessons = resolveDay(data([base], [cancel, add]), MON_W6, G12);
    expect(lessons.some((l) => l.conflict)).toBe(false);
  });

  it("over self-study is not a conflict", () => {
    const self = entry({ id: "s", subjectId: "self", weekday: 6, slotN: 2, kind: "self_study" });
    const c = change({
      type: "add",
      date: SAT_W6,
      slotN: 2,
      newSubjectId: "audit",
      newKind: "lecture",
    });
    const lessons = resolveDay(data([self], [c]), SAT_W6, G12);
    expect(lessons.some((l) => l.conflict)).toBe(false);
    expect(summarizeDay(lessons).lessons).toBe(1);
  });
});

describe("resolveWeek", () => {
  it("returns seven days from Monday", () => {
    const week = resolveWeek(data([entry({ id: "e", subjectId: "zis" })]), MON_W6, G12);
    expect(week.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(week[0]?.lessons).toHaveLength(1);
  });
});
