import { describe, expect, it } from "vitest";
import { withoutEmpty } from "./env";

describe("withoutEmpty", () => {
  it("drops empty and undefined values, keeps the rest", () => {
    expect(withoutEmpty({ A: "", B: "x", C: undefined, D: "0" })).toEqual({ B: "x", D: "0" });
  });
});
