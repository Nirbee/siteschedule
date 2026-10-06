-- Re-index all text: OCR now drops sideways running heads and margin marks, and lines
-- repeated at the top/bottom of many pages are removed (lib/ingest/ocr-layout.ts).
DELETE FROM "media_pages";
--> statement-breakpoint
UPDATE "media" SET "text_status" = 'pending'
WHERE "deleted_at" IS NULL AND "text_status" IN ('ready', 'failed');
