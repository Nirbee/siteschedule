ALTER TABLE "media" ADD COLUMN "view_key" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "view_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE INDEX "media_view_pending" ON "media" USING btree ("created_at") WHERE "media"."view_status" = 'pending' and "media"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_view_status_check" CHECK ("media"."view_status" in ('none', 'pending', 'ready', 'failed'));--> statement-breakpoint
-- Files uploaded before in-site viewing existed: queue their PDF copies.
UPDATE "media" SET "view_status" = 'pending'
WHERE "kind" = 'file' AND "deleted_at" IS NULL
  AND lower("file_name") ~ '\.(docx?|pptx?|xlsx?|odt|odp|ods|rtf|djvu)$';
