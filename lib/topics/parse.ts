// Parsing pasted/recognised lists of topics. No server-only imports: used in forms too.

export interface ParsedTopic {
  title: string;
  details: string | null;
}

const NUMBER = /^\s*\d+\s*[.)]?\s*/;

/**
 * Topics from text: one per line, or rows pasted from Excel (tab-separated: № | тема | подтема |
 * …). Numbering and a header row are dropped; an empty «тема» cell next to a «подтема» repeats
 * the topic above (merged cells). Columns after «подтема» (ФИО, группа) are ignored.
 */
export function parseTopics(text: string): ParsedTopic[] {
  const result: ParsedTopic[] = [];
  let lastTitle: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let cols = raw.split("\t").map((c) => c.replace(/\s+/g, " ").trim());
    if (cols.length > 1 && /^\d*$/.test(cols[0]!)) cols = cols.slice(1);
    let title = cols[0] ?? "";
    let details = cols[1] || null;
    if (cols.length === 1) title = title.replace(NUMBER, "");
    if (/^(тема|название|№)$/i.test(title)) continue; // header row
    if (!title && details && lastTitle) title = lastTitle;
    if (!title) continue;
    if (details && details === title) details = null;
    result.push({ title: title.slice(0, 300), details: details?.slice(0, 300) ?? null });
    lastTitle = title;
  }
  return result;
}
