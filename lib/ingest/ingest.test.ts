import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { lessonNotes, media, semesters, subjects, timeSlots } from "@/lib/db/schema";
import { upsertTelegramUser } from "@/lib/services/users";
import { objectPath, setStorageRootForTesting } from "@/lib/storage/disk";
import { createTestDb, resetTestDb } from "@/lib/testing/test-db";
import { detectUpload, safeFileName } from "./detect";
import { ingest, type IngestTarget } from "./ingest";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let storage: string;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  storage = await mkdtemp(path.join(tmpdir(), "para-storage-"));
  setStorageRootForTesting(storage);
}, 60_000);
afterAll(async () => {
  setStorageRootForTesting(undefined);
  await rm(storage, { recursive: true, force: true });
  await testDb.close();
});
beforeEach(() => resetTestDb(db));

async function setup() {
  await db.insert(timeSlots).values({ n: 5, startsAt: "15:55", endsAt: "17:25" });
  const [semester] = await db
    .insert(semesters)
    .values({ title: "Осень 2026", startsOn: "2026-08-31", endsOn: "2026-12-27", isCurrent: true })
    .returning();
  const [subject] = await db
    .insert(subjects)
    .values({ semesterId: semester!.id, name: "Основы предпринимательства" })
    .returning();
  const user = await upsertTelegramUser(db, { id: 1, firstName: "Аня" }, { grantAccess: true });
  const lesson: IngestTarget = {
    type: "lesson",
    subjectId: subject!.id,
    date: "2026-09-30",
    slotN: 5,
    startsAt: null,
    kind: "lecture",
  };
  return { subjectId: subject!.id, userId: user.id, lesson };
}

/** A 4000×3000 JPEG shot "sideways" (EXIF orientation 6) with GPS and camera tags. */
async function phonePhoto(seed = 0): Promise<Buffer> {
  return sharp({
    create: {
      width: 4000,
      height: 3000,
      channels: 3,
      background: { r: (seed * 97) % 256, g: 120, b: 200 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "55/1 45/1 0/1" },
    })
    .toBuffer();
}

describe("detectUpload", () => {
  it("recognises photos by bytes and documents by extension", async () => {
    expect(detectUpload(await phonePhoto(), "IMG_0001.HEIC")).toEqual({
      kind: "photo",
      format: "jpeg",
    });
    const heicHeader = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(16),
    ]);
    expect(detectUpload(heicHeader, "IMG_0002.HEIC")).toEqual({ kind: "photo", format: "heic" });
    expect(detectUpload(Buffer.from("%PDF-1.7"), "Лекция 1.PDF")).toMatchObject({
      kind: "file",
      extension: "pdf",
    });
    expect(detectUpload(Buffer.from("AT&TFORM"), "Том 2.djvu")).toMatchObject({ kind: "file" });
    expect(detectUpload(Buffer.from("MZ"), "virus.exe")).toMatchObject({ kind: "rejected" });
    expect(detectUpload(Buffer.alloc(0), "empty.pdf")).toMatchObject({ kind: "rejected" });
  });

  it("enforces size limits", () => {
    const big = Buffer.alloc(51 * 1024 * 1024);
    expect(detectUpload(big, "book.pdf")).toEqual({
      kind: "rejected",
      reason: "Файл больше 50 МБ",
    });
  });

  it("makes file names safe but keeps Cyrillic", () => {
    expect(safeFileName("../../Том_2: Графы?.pdf")).toBe("Том_2_ Графы_.pdf");
    expect(safeFileName("C:\\Users\\me\\Лекция 1.pdf")).toBe("Лекция 1.pdf");
    expect(safeFileName("...")).toBe("file");
  });
});

describe("ingest", () => {
  it("photos: orientation applied, metadata removed, 2560 + 480 webp", async () => {
    const s = await setup();
    const result = await ingest({
      bytes: await phonePhoto(),
      fileName: "IMG_0001.jpg",
      target: s.lesson,
      uploaderId: s.userId,
    });
    expect(result).toMatchObject({ status: "created", kind: "photo" });
    const [row] = await db.select().from(media);
    // Sideways 4000×3000 becomes upright 3000×4000, then fits into 2560.
    expect(row).toMatchObject({ width: 1920, height: 2560, mime: "image/webp", status: "sorted" });

    const full = await sharp(await readFile(objectPath(row!.storageKey))).metadata();
    expect(full).toMatchObject({ format: "webp", width: 1920, height: 2560 });
    expect(full.exif).toBeUndefined();
    expect(full.orientation).toBeUndefined();

    const preview = await sharp(await readFile(objectPath(row!.previewKey!))).metadata();
    expect(preview.width).toBe(480);
    expect(preview.exif).toBeUndefined();
  });

  it("creates the lesson note once and keeps photo order", async () => {
    const s = await setup();
    await ingest({
      bytes: await phonePhoto(1),
      fileName: "a.jpg",
      target: { ...s.lesson, title: "Создание ООО" },
      uploaderId: s.userId,
    });
    await ingest({
      bytes: await phonePhoto(2),
      fileName: "b.jpg",
      target: s.lesson,
      uploaderId: s.userId,
    });
    const notes = await db.select().from(lessonNotes);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe("Создание ООО");
    expect((await db.select().from(media)).map((m) => m.sort).sort()).toEqual([0, 1]);
  });

  it("skips duplicates", async () => {
    const s = await setup();
    const photo = await phonePhoto();
    const first = await ingest({
      bytes: photo,
      fileName: "a.jpg",
      target: s.lesson,
      uploaderId: s.userId,
    });
    const second = await ingest({
      bytes: photo,
      fileName: "copy.jpg",
      target: s.lesson,
      uploaderId: s.userId,
    });
    expect(second).toEqual({
      status: "duplicate",
      mediaId: first.status === "created" ? first.mediaId : "",
    });
    expect(await db.select().from(media)).toHaveLength(1);
  });

  it("files go to subject materials as is; PDFs get a page count", async () => {
    const s = await setup();
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    const pdf = await doc.save();

    const result = await ingest({
      bytes: pdf,
      fileName: "Unknown 7.pdf",
      target: { type: "materials", subjectId: s.subjectId },
      uploaderId: s.userId,
    });
    expect(result).toMatchObject({ status: "created", kind: "file", lessonNoteId: null });
    const [row] = await db.select().from(media);
    expect(row).toMatchObject({
      fileName: "Unknown 7.pdf",
      title: null,
      pageCount: 2,
      mime: "application/pdf",
      lessonNoteId: null,
      subjectId: s.subjectId,
    });
    expect(Buffer.compare(await readFile(objectPath(row!.storageKey)), Buffer.from(pdf))).toBe(0);
  });

  it("rejects unsupported and unreadable uploads without leaving files behind", async () => {
    const s = await setup();
    expect(
      await ingest({
        bytes: Buffer.from("MZ..."),
        fileName: "setup.exe",
        target: s.lesson,
        uploaderId: s.userId,
      }),
    ).toMatchObject({ status: "rejected" });
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(100)]);
    expect(
      await ingest({
        bytes: broken,
        fileName: "broken.jpg",
        target: s.lesson,
        uploaderId: s.userId,
      }),
    ).toEqual({ status: "rejected", error: "Не удалось прочитать фото" });
    expect(await db.select().from(media)).toHaveLength(0);
  });
});
