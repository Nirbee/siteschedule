// Cleaning OCR and text-layer output for search: running heads printed sideways in the margin
// («Глава 4. Алгоритмы» on every page of a chapter) and lines repeated at the top/bottom of
// many pages would otherwise make a word match every page. Pure functions.

/** Words Tesseract is this unsure about are noise (©, stray marks from formulas). */
const MIN_WORD_CONF = 15;
/** Blocks entirely within this share of the page width at the left/right edge are margins. */
const MARGIN = 0.07;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Text from `tesseract … tsv` output: blocks of rotated (vertical) text are dropped; with
 * `dropMargins`, so are blocks lying entirely in the side margins (book scans, not photos).
 */
export function textFromTsv(tsv: string, { dropMargins }: { dropMargins: boolean }): string {
  const rows = tsv
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 12);
  const num = (cols: string[], i: number) => Number(cols[i]);
  const box = (cols: string[]): Box => ({
    left: num(cols, 6),
    top: num(cols, 7),
    width: num(cols, 8),
    height: num(cols, 9),
  });

  const page = rows.find((cols) => num(cols, 0) === 1);
  const pageWidth = page ? box(page).width : 0;
  const dropped = new Set<string>();
  for (const cols of rows) {
    if (num(cols, 0) !== 2) continue;
    const b = box(cols);
    const vertical = b.height > 2 * b.width && b.height > 60;
    const inMargin =
      dropMargins &&
      pageWidth > 0 &&
      (b.left + b.width < pageWidth * MARGIN || b.left > pageWidth * (1 - MARGIN));
    if (vertical || inMargin) dropped.add(cols[2]!);
  }

  const lines = new Map<string, string[]>();
  for (const cols of rows) {
    if (num(cols, 0) !== 5 || dropped.has(cols[2]!)) continue;
    const text = cols.slice(11).join("\t").trim();
    if (!text || num(cols, 10) < MIN_WORD_CONF) continue;
    const key = `${cols[2]}.${cols[3]}.${cols[4]}`;
    lines.set(key, [...(lines.get(key) ?? []), text]);
  }
  return [...lines.values()].map((words) => words.join(" ")).join("\n");
}

/** Letters only, lower case: «Глава 4. Алгоритмы» and «ГЛАВА 4 АЛГОРИТМЫ» are the same. */
const lineKey = (line: string) => line.toLowerCase().replace(/[^\p{L}]/gu, "");

/** Lines at the top or bottom of a page that may be a running head or foot. */
const EDGE_LINES = 2;

/**
 * Removes running heads/feet: lines among the first or last two of a page whose letters repeat
 * on many pages of the document. Page numbers alone have no letters and are left alone.
 */
export function stripRepeatedLines(pages: string[]): string[] {
  const split = pages.map((text) => text.split("\n"));
  const edge = (lines: string[]) =>
    new Set(
      [...lines.slice(0, EDGE_LINES), ...lines.slice(-EDGE_LINES)]
        .map(lineKey)
        .filter((key) => key.length >= 4 && key.length <= 80),
    );
  const counts = new Map<string, number>();
  for (const lines of split)
    for (const key of edge(lines)) counts.set(key, (counts.get(key) ?? 0) + 1);

  const threshold = Math.max(4, Math.ceil(pages.length * 0.1));
  const repeated = new Set([...counts].filter(([, n]) => n >= threshold).map(([key]) => key));
  if (repeated.size === 0) return pages;

  return split.map((lines) =>
    lines
      .filter((line, i) => {
        const atEdge = i < EDGE_LINES || i >= lines.length - EDGE_LINES;
        return !(atEdge && repeated.has(lineKey(line)));
      })
      .join("\n"),
  );
}
