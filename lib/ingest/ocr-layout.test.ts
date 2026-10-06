import { describe, expect, it } from "vitest";
import { stripRepeatedLines, textFromTsv } from "./ocr-layout";

const HEADER =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const row = (
  level: number,
  block: number,
  line: number,
  box: [number, number, number, number],
  conf: number,
  text = "",
) => [level, 1, block, 1, line, 1, ...box, conf, text].join("\t");

// Page 1117 px wide (A5 at 200 dpi): body text, a running head printed sideways in the left
// margin, a stray mark in the right margin.
const tsv = [
  HEADER,
  row(1, 0, 0, [0, 0, 1117, 1600], -1),
  row(2, 1, 0, [65, 180, 18, 172], -1),
  row(5, 1, 1, [65, 180, 18, 172], 91, "Глава 4. Алгоритмы"),
  row(2, 2, 0, [114, 123, 893, 60], -1),
  row(5, 2, 1, [115, 123, 120, 27], 96, "Сортировка."),
  row(5, 2, 1, [240, 123, 120, 27], 95, "Рассмотрим"),
  row(5, 2, 2, [115, 155, 120, 27], 94, "пример"),
  row(5, 2, 2, [240, 155, 20, 27], 4, "©"),
  row(2, 3, 0, [1054, 127, 23, 21], -1),
  row(5, 3, 1, [1054, 127, 10, 21], 33, "в"),
].join("\n");

describe("textFromTsv", () => {
  it("drops sideways running heads, margin marks and noise words", () => {
    expect(textFromTsv(tsv, { dropMargins: true })).toBe("Сортировка. Рассмотрим\nпример");
  });

  it("keeps edge text on photos, still drops rotated text", () => {
    expect(textFromTsv(tsv, { dropMargins: false })).toBe("Сортировка. Рассмотрим\nпример\nв");
  });
});

describe("stripRepeatedLines", () => {
  const topics = ["графы", "деревья", "сортировка", "поиск", "кучи", "хеши"];
  const book = Array.from(
    { length: 12 },
    (_, i) => `ГЛАВА 4. АЛГОРИТМЫ\nПро ${topics[i % 6]} ${"и ".repeat(i)}далее\n${i + 1}`,
  );

  it("removes running heads repeated on many pages, keeps the rest", () => {
    const cleaned = stripRepeatedLines(book);
    expect(cleaned[0]).toBe("Про графы далее\n1");
    expect(cleaned[1]).toBe("Про деревья и далее\n2");
  });

  it("keeps lines that repeat only a few times or sit in the middle of a page", () => {
    const pages = [
      "Начало\nа\nб\nОпределение графа\nв\nг\nконец",
      "Определение графа\nтекст",
      "x\ny",
    ];
    expect(stripRepeatedLines(pages)).toEqual(pages);
  });
});
