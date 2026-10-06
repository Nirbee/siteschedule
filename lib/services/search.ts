// Library search: words inside files (text layer or OCR, see lib/ingest/text-index) and in
// file names. Russian morphology comes from Postgres («проклятия размерностей» finds
// «Проклятие размерности»).
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lessonNotes, media, mediaPages, subjects } from "@/lib/db/schema";
import type { IsoDate } from "@/lib/schedule/dates";

/** Marks around matched words in snippets; the UI turns them into <mark>. */
export const HIT_START = "⟪";
export const HIT_END = "⟫";

const MAX_FILES = 30;
const PAGES_PER_FILE = 3;

export interface SearchHit {
  page: number;
  snippet: string;
}

export interface SearchResult {
  id: string;
  kind: "photo" | "file";
  fileName: string;
  title: string | null;
  pageCount: number | null;
  subjectId: string | null;
  subjectName: string | null;
  lessonDate: IsoDate | null;
  lessonTitle: string | null;
  /** The query matched the file's name or title. */
  nameMatch: boolean;
  /** Best pages first by relevance, then shown in page order. */
  hits: SearchHit[];
}

export interface SearchResponse {
  results: SearchResult[];
  /** Files still waiting for text recognition — results may be incomplete. */
  indexing: number;
}

export const normalizeQuery = (q: string) => q.replace(/[⟪⟫]/g, " ").trim().slice(0, 100);

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const visible = and(isNull(media.deletedAt), eq(media.status, "sorted"));

export async function searchLibrary(rawQuery: string): Promise<SearchResponse> {
  const q = normalizeQuery(rawQuery);
  const [{ indexing } = { indexing: 0 }] = await db()
    .select({ indexing: sql<number>`count(*)`.mapWith(Number) })
    .from(media)
    .where(and(eq(media.textStatus, "pending"), isNull(media.deletedAt)));
  if (q.length < 2) return { results: [], indexing };

  const query = sql`websearch_to_tsquery('russian', ${q})`;
  const rank = sql<number>`ts_rank_cd(${mediaPages.tsv}, ${query})`.mapWith(Number);
  const pageRows = await db()
    .select({ mediaId: mediaPages.mediaId, page: mediaPages.page, rank })
    .from(mediaPages)
    .innerJoin(media, eq(media.id, mediaPages.mediaId))
    .where(and(sql`${mediaPages.tsv} @@ ${query}`, visible))
    .orderBy(desc(rank))
    .limit(300);

  const nameRows = await db()
    .select({ id: media.id })
    .from(media)
    .where(
      and(visible, or(ilike(media.fileName, likePattern(q)), ilike(media.title, likePattern(q)))),
    )
    .limit(MAX_FILES);

  // Score per file: best page rank; a name match ranks above any text match.
  const score = new Map<string, number>();
  const pagesOf = new Map<string, number[]>();
  for (const row of pageRows) {
    if (!score.has(row.mediaId)) score.set(row.mediaId, row.rank);
    const list = pagesOf.get(row.mediaId) ?? [];
    if (list.length < PAGES_PER_FILE) pagesOf.set(row.mediaId, [...list, row.page]);
  }
  const named = new Set(nameRows.map((r) => r.id));
  for (const id of named) score.set(id, 1000 + (score.get(id) ?? 0));

  const ids = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FILES)
    .map(([id]) => id);
  if (ids.length === 0) return { results: [], indexing };

  const wanted = ids.flatMap((id) => (pagesOf.get(id) ?? []).map((page) => `${id}:${page}`));
  const [items, snippets] = await Promise.all([
    db()
      .select({
        id: media.id,
        kind: media.kind,
        fileName: media.fileName,
        title: media.title,
        pageCount: media.pageCount,
        subjectId: media.subjectId,
        subjectName: subjects.name,
        lessonDate: lessonNotes.date,
        lessonTitle: lessonNotes.title,
      })
      .from(media)
      .leftJoin(subjects, eq(subjects.id, media.subjectId))
      .leftJoin(lessonNotes, eq(lessonNotes.id, media.lessonNoteId))
      .where(inArray(media.id, ids)),
    wanted.length === 0
      ? Promise.resolve([])
      : db()
          .select({
            mediaId: mediaPages.mediaId,
            page: mediaPages.page,
            snippet: sql<string>`ts_headline('russian', ${mediaPages.text}, ${query},
              ${`StartSel=${HIT_START}, StopSel=${HIT_END}, MaxWords=28, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "`})`,
          })
          .from(mediaPages)
          .where(inArray(sql`${mediaPages.mediaId}::text || ':' || ${mediaPages.page}`, wanted)),
  ]);

  const byId = new Map(items.map((item) => [item.id, item]));
  const results = ids.flatMap((id): SearchResult[] => {
    const item = byId.get(id);
    if (!item) return [];
    const hits = snippets
      .filter((s) => s.mediaId === id)
      .map((s) => ({ page: s.page, snippet: s.snippet }))
      .sort((a, b) => a.page - b.page);
    return [{ ...item, nameMatch: named.has(id), hits }];
  });
  return { results, indexing };
}

/** Splits a snippet into plain and highlighted parts (rendered as text, never as HTML). */
export function snippetParts(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  for (const [i, chunk] of snippet.split(HIT_START).entries()) {
    if (i === 0) {
      if (chunk) parts.push({ text: chunk, hit: false });
      continue;
    }
    const end = chunk.indexOf(HIT_END);
    if (end === -1) {
      parts.push({ text: chunk, hit: false });
      continue;
    }
    parts.push({ text: chunk.slice(0, end), hit: true });
    if (end + 1 < chunk.length) parts.push({ text: chunk.slice(end + 1), hit: false });
  }
  return parts;
}
