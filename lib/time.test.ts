import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";
import { TIME_ZONE, formatLongDate } from "./time";

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
