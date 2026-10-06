import { describe, expect, it } from "vitest";
import { decodeText, parseCsv } from "./text";

describe("decodeText", () => {
  it("reads UTF-8 and falls back to Windows-1251", () => {
    expect(decodeText(new TextEncoder().encode("﻿Привет"))).toBe("Привет");
    // «Привет» in Windows-1251
    expect(decodeText(new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]))).toBe("Привет");
  });
});

describe("parseCsv", () => {
  it("detects the delimiter and handles quotes", () => {
    expect(
      parseCsv('№;Тема;Кто\r\n1;"Электронная подпись; ЭП";Аня\r\n2;"Он сказал ""да""";\r\n'),
    ).toEqual([
      ["№", "Тема", "Кто"],
      ["1", "Электронная подпись; ЭП", "Аня"],
      ["2", 'Он сказал "да"', ""],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
