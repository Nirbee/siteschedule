CREATE TABLE "media_pages" (
	"media_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('russian', text)) STORED,
	CONSTRAINT "media_pages_media_id_page_pk" PRIMARY KEY("media_id","page")
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "text_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_pages" ADD CONSTRAINT "media_pages_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_pages_tsv" ON "media_pages" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "media_text_pending" ON "media" USING btree ("created_at") WHERE "media"."text_status" = 'pending' and "media"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_text_status_check" CHECK ("media"."text_status" in ('none', 'pending', 'ready', 'failed'));--> statement-breakpoint
-- Index everything already uploaded: photos (OCR) and documents with text or a PDF copy.
UPDATE "media" SET "text_status" = 'pending'
WHERE "deleted_at" IS NULL AND (
  "kind" = 'photo'
  OR lower("file_name") ~ '\.(pdf|txt|csv|docx?|pptx?|xlsx?|odt|odp|ods|rtf|djvu)$'
);
