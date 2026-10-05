import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";
import { TIME_ZONE, formatLongDate, formatRelativeDay } from "./time";

describe("formatLongDate", () => {
  it("formats in Russian", () => {
    expect(formatLongDate(new TZDate(2026, 9, 5, 12, 0, TIME_ZONE))).toBe("понедельник, 5 октября");
  });

  it("uses the Moscow calendar day near midnight UTC", () => {
    // 2026-10-05 22:30 UTC is already Tuesday 01:30 in Moscow.
    const instant = new TZDate(Date.UTC(2026, 9, 5, 22, 30), TIME_ZONE);
    expect(formatLongDate(instant)).toBe("вторник, 6 октября");
  });
});

describe("formatRelativeDay", () => {
  const now = new Date(Date.UTC(2026, 9, 6, 9, 0)); // 12:00 MSK, Oct 6

  it("names today and yesterday by Moscow calendar", () => {
    expect(formatRelativeDay(new Date(Date.UTC(2026, 9, 5, 21, 30)), now)).toBe("сегодня"); // 00:30 MSK
    expect(formatRelativeDay(new Date(Date.UTC(2026, 9, 5, 20, 30)), now)).toBe("вчера"); // 23:30 MSK
  });

  it("shows short dates for older days", () => {
    expect(formatRelativeDay(new Date(Date.UTC(2026, 9, 1, 9, 0)), now)).toBe("1 окт.");
    expect(formatRelativeDay(new Date(Date.UTC(2025, 9, 1, 9, 0)), now)).toBe("1 окт. 2025");
  });
});
