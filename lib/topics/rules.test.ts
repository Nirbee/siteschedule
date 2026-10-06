import { describe, expect, it } from "vitest";
import {
  CODE_STEP_MS,
  canPick,
  classCode,
  listPhase,
  openingAnnouncement,
  shortGroup,
  topicStatus,
  verifyClassCode,
} from "./rules";
import { parseTopics } from "./parse";

const at = (iso: string) => new Date(iso);

describe("listPhase", () => {
  const now = at("2026-10-06T12:00:00Z");
  const base = { classOpenedAt: null, opensAt: null, pickDeadline: null };

  it("goes draft → class → open → closed", () => {
    expect(listPhase(base, now)).toBe("draft");
    expect(listPhase({ ...base, opensAt: at("2026-10-06T17:00:00Z") }, now)).toBe("scheduled");
    const inClass = { ...base, classOpenedAt: at("2026-10-06T11:00:00Z") };
    expect(listPhase(inClass, now)).toBe("class");
    expect(listPhase({ ...inClass, opensAt: at("2026-10-06T17:00:00Z") }, now)).toBe("class");
    expect(listPhase({ ...inClass, opensAt: at("2026-10-06T11:30:00Z") }, now)).toBe("open");
    expect(
      listPhase({ ...inClass, opensAt: at("2026-10-06T11:30:00Z"), pickDeadline: now }, now),
    ).toBe("closed");
  });

  it("only code holders pick in class, everyone when open", () => {
    expect(canPick("class", false)).toBe(false);
    expect(canPick("class", true)).toBe(true);
    expect(canPick("open", false)).toBe(true);
    expect(canPick("closed", true)).toBe(false);
    expect(canPick("scheduled", true)).toBe(false);
  });
});

describe("topicStatus", () => {
  it("covers every state", () => {
    expect(topicStatus({ isDone: true, capacity: 1 }, 1, true)).toBe("done");
    expect(topicStatus({ isDone: false, capacity: 2 }, 1, true)).toBe("mine");
    expect(topicStatus({ isDone: false, capacity: 2 }, 2, false)).toBe("full");
    expect(topicStatus({ isDone: false, capacity: 2 }, 1, false)).toBe("partial");
    expect(topicStatus({ isDone: false, capacity: 1 }, 0, false)).toBe("free");
  });
});

describe("parseTopics", () => {
  it("reads rows pasted from Excel: number, topic, subtopic, extra columns", () => {
    const pasted = [
      "№\tТема\t\tФИО студента\tГруппа",
      "1\tГосударственная тайна. Служебная тайна\t\t\t",
      "4\tИнтеллектуальная собственность\tЗаконодательство об авторском праве\tИванов И.\t11",
      "5\t\tНормативная база патентования\t\t",
      "6\tКоммерческая тайна",
    ].join("\n");
    expect(parseTopics(pasted)).toEqual([
      { title: "Государственная тайна. Служебная тайна", details: null },
      { title: "Интеллектуальная собственность", details: "Законодательство об авторском праве" },
      { title: "Интеллектуальная собственность", details: "Нормативная база патентования" },
      { title: "Коммерческая тайна", details: null },
    ]);
  });

  it("reads a plain list with or without numbers", () => {
    expect(parseTopics("1. Электронная подпись\n2) Оценка рисков\n\nКИИ")).toEqual([
      { title: "Электронная подпись", details: null },
      { title: "Оценка рисков", details: null },
      { title: "КИИ", details: null },
    ]);
  });
});

describe("class code", () => {
  const secret = "test-secret";
  const now = 1_790_000_000_000;

  it("is 4 digits and changes every 30 s", () => {
    expect(classCode(secret, now)).toMatch(/^\d{4}$/);
    expect(classCode(secret, now)).toBe(classCode(secret, now - (now % CODE_STEP_MS)));
  });

  it("accepts the current and the previous code only", () => {
    const current = classCode(secret, now);
    const previous = classCode(secret, now - CODE_STEP_MS);
    const old = classCode(secret, now - 3 * CODE_STEP_MS);
    expect(verifyClassCode(secret, current, now)).toBe(true);
    expect(verifyClassCode(secret, ` ${previous} `, now)).toBe(true);
    if (old !== current && old !== previous) expect(verifyClassCode(secret, old, now)).toBe(false);
    expect(verifyClassCode(secret, "12", now)).toBe(false);
  });
});

describe("texts", () => {
  it("short group code", () => {
    expect(shortGroup("ИУ8-12М")).toBe("12М");
    expect(shortGroup(null)).toBeNull();
  });

  it("announces the opening with free topics", () => {
    const text = openingAnnouncement(
      { title: "Доклады", subjectName: "ОПО ИБ", url: "https://x/topics/1", deadline: "9 октября" },
      [
        { n: 1, title: "Гостайна", details: null, capacity: 1, members: 1 },
        { n: 2, title: "ПДн", details: "Биометрия", capacity: 1, members: 0 },
      ],
    );
    expect(text).toContain("Свободно 1 из 2:\n2. ПДн — Биометрия");
    expect(text).toContain("Заняты: 1.");
    expect(text).toContain("Выбрать до 9 октября.");
  });
});

describe("listAsText", () => {
  it("one line per topic, team members together", async () => {
    const { listAsText } = await import("./rules");
    expect(
      listAsText("Доклады", "ОПО ИБ", [
        { n: 1, title: "Гостайна", details: null, name: "Иванова Анна", group: "12" },
        { n: 1, title: "Гостайна", details: null, name: "Петров Борис", group: "11" },
        { n: 2, title: "ПДн", details: "Биометрия", name: "", group: "" },
      ]),
    ).toBe(
      "Доклады · ОПО ИБ\n1. Гостайна: Иванова Анна (12), Петров Борис (11)\n2. ПДн — Биометрия: свободна",
    );
  });
});
