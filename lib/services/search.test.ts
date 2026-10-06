import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { media, mediaPages, semesters, subjects } from "@/lib/db/schema";
import { ingest } from "@/lib/ingest/ingest";
import { cleanText, processTextIndex } from "@/lib/ingest/text-index";
import { setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { normalizeQuery, searchLibrary, snippetParts } from "./search";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-search-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

async function subject(name = "Машинное обучение") {
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [row] = await db.insert(subjects).values({ semesterId: semester!.id, name }).returning();
  return row!.id;
}

async function upload(subjectId: string, fileName: string, text: string) {
  const result = await ingest({
    bytes: Buffer.from(text, "utf8"),
    fileName,
    target: { type: "materials", subjectId },
    uploaderId: null,
  });
  if (result.status !== "created") throw new Error(result.status);
  return result.mediaId;
}

describe("text index", () => {
  it("joins hyphenated words, collapses spaces, keeps lines", () => {
    expect(cleanText("в этом вари-\n  анте   данные\n\nи  всё")).toBe(
      "в этом варианте данные\nи всё",
    );
  });

  it("indexes text files and marks them ready", async () => {
    const id = await upload(
      await subject(),
      "Лекция.txt",
      "Проклятие размерности и\nметод главных компонент",
    );
    const [before] = await db.select().from(media).where(eq(media.id, id));
    expect(before!.textStatus).toBe("pending");

    await processTextIndex();
    const [after] = await db.select().from(media).where(eq(media.id, id));
    expect(after!.textStatus).toBe("ready");
    const pages = await db.select().from(mediaPages).where(eq(mediaPages.mediaId, id));
    expect(pages).toMatchObject([
      { page: 1, source: "text", text: "Проклятие размерности и\nметод главных компонент" },
    ]);
  });

  it("does not index archives", async () => {
    const subjectId = await subject();
    const result = await ingest({
      bytes: Buffer.from("PK\x05\x06" + "\0".repeat(18), "binary"),
      fileName: "Архив.zip",
      target: { type: "materials", subjectId },
      uploaderId: null,
    });
    const id = result.status === "created" ? result.mediaId : "";
    const [row] = await db.select().from(media).where(eq(media.id, id));
    expect(row!.textStatus).toBe("none");
  });
});

describe("searchLibrary", () => {
  it("finds words in other forms and highlights them", async () => {
    const subjectId = await subject();
    const id = await upload(subjectId, "Конспект.txt", "Сегодня обсудим проклятие размерности.");
    await upload(subjectId, "Другое.txt", "Совсем про другое: линейная регрессия.");
    await processTextIndex();

    const { results, indexing } = await searchLibrary("проклятия размерностей");
    expect(indexing).toBe(0);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id,
      subjectName: "Машинное обучение",
      nameMatch: false,
      hits: [{ page: 1 }],
    });
    const parts = snippetParts(results[0]!.hits[0]!.snippet);
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["проклятие", "размерности"]);
  });

  it("matches file names, ranked above text matches", async () => {
    const subjectId = await subject();
    const inText = await upload(subjectId, "a.txt", "Задачи по регрессии");
    const named = await upload(subjectId, "Регрессия семинар.txt", "без нужных слов");
    await processTextIndex();

    const { results } = await searchLibrary("регрессия");
    expect(results.map((r) => r.id)).toEqual([named, inText]);
    expect(results[0]!.nameMatch).toBe(true);
  });

  it("skips deleted files and reports files still waiting for indexing", async () => {
    const subjectId = await subject();
    const gone = await upload(subjectId, "a.txt", "градиентный спуск");
    await processTextIndex();
    await db.update(media).set({ deletedAt: new Date() }).where(eq(media.id, gone));
    await upload(subjectId, "b.txt", "градиентный спуск снова");

    const { results, indexing } = await searchLibrary("градиентный");
    expect(results).toHaveLength(0);
    expect(indexing).toBe(1);
  });

  it("ignores too short queries and LIKE wildcards", async () => {
    const subjectId = await subject();
    await upload(subjectId, "a.txt", "текст");
    await processTextIndex();
    expect((await searchLibrary("а")).results).toEqual([]);
    expect((await searchLibrary("%%")).results).toEqual([]);
    expect(normalizeQuery(" ⟪x⟫ ")).toBe("x");
  });
});

describe("snippetParts", () => {
  it("splits marked words", () => {
    expect(snippetParts("до ⟪слово⟫ после")).toEqual([
      { text: "до ", hit: false },
      { text: "слово", hit: true },
      { text: " после", hit: false },
    ]);
  });
});
