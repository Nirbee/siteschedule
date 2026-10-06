import { describe, expect, it } from "vitest";
import { displayName, formatBytes } from "./format";

describe("library format", () => {
  it("shows readable names", () => {
    expect(displayName({ title: null, fileName: "Том_2_Графы,_Алгоритмы_2012.pdf" })).toBe(
      "Том 2 Графы, Алгоритмы 2012",
    );
    expect(displayName({ title: "Задачи к семинару 3", fileName: "Unknown 7.pdf" })).toBe(
      "Задачи к семинару 3",
    );
  });

  it("formats sizes in Russian", () => {
    expect(formatBytes(500)).toBe("1 КБ");
    expect(formatBytes(7.2 * 1024 * 1024)).toBe("7,2 МБ");
  });
});
