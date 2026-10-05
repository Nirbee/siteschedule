import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit within a window, then resets", () => {
    const key = `test-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(key, 2, 1000, 0))).toEqual([true, true, false]);
    expect(rateLimit(key, 2, 1000, 1000)).toBe(true);
  });
});
