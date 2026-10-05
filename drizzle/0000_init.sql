CREATE TYPE "public"."change_type" AS ENUM('cancel', 'replace', 'move', 'add', 'room');--> statement-breakpoint
CREATE TYPE "public"."lesson_kind" AS ENUM('lecture', 'seminar', 'practice', 'lab', 'self_study');--> statement-breakpoint
CREATE TYPE "public"."login_method" AS ENUM('telegram', 'qr', 'admin_link');--> statement-breakpoint
CREATE TYPE "public"."login_status" AS ENUM('pending', 'confirmed', 'consumed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'file');--> statement-breakpoint
CREATE TYPE "public"."media_source" AS ENUM('upload', 'tg_import', 'tg_bot');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('sorted', 'unsorted');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'starosta', 'admin');--> statement-breakpoint
CREATE TYPE "public"."week_parity" AS ENUM('any', 'numerator', 'denominator');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot_n" smallint,
	"starts_at" time,
	"ends_at" time,
	"form" text NOT NULL,
	"room" text,
	"admission" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "lesson_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot_n" smallint,
	"starts_at" time,
	"kind" "lesson_kind",
	"title" text,
	CONSTRAINT "lesson_notes_lesson_unique" UNIQUE NULLS NOT DISTINCT("subject_id","date","slot_n","starts_at")
);
--> statement-breakpoint
CREATE TABLE "login_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" "login_method" NOT NULL,
	"code_hash" text NOT NULL,
	"poll_hash" text,
	"status" "login_status" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "login_requests_codeHash_unique" UNIQUE("code_hash"),
	CONSTRAINT "login_requests_pollHash_unique" UNIQUE("poll_hash")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "media_status" NOT NULL,
	"subject_id" uuid,
	"lesson_note_id" uuid,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"preview_key" text,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"source" "media_source" NOT NULL,
	"uploader_id" uuid,
	"tg_author_id" bigint,
	"tg_author_name" text,
	"tg_chat_id" bigint,
	"tg_message_id" bigint,
	"tg_thread_id" bigint,
	"tg_media_group_id" text,
	"posted_at" timestamp with time zone NOT NULL,
	"suggested_subject_id" uuid,
	"suggested_lesson_date" date,
	"suggested_slot_n" smallint,
	"suggestion_reason" text,
	"sorted_by" uuid,
	"sorted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_sorted_has_subject" CHECK ("media"."status" = 'unsorted' or "media"."subject_id" is not null),
	CONSTRAINT "media_lesson_has_subject" CHECK ("media"."lesson_note_id" is null or "media"."subject_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"send_to_tg" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"chat_id" bigint NOT NULL,
	"thread_id" bigint,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"tg_message_id" bigint,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "schedule_change_groups" (
	"change_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "schedule_change_groups_change_id_group_id_pk" PRIMARY KEY("change_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "change_type" NOT NULL,
	"date" date NOT NULL,
	"entry_id" uuid,
	"slot_n" smallint,
	"starts_at" time,
	"ends_at" time,
	"new_subject_id" uuid,
	"new_kind" "lesson_kind",
	"new_room" text,
	"new_teacher" text,
	"new_date" date,
	"new_slot_n" smallint,
	"new_starts_at" time,
	"new_ends_at" time,
	"comment" text,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "schedule_changes_entry_check" CHECK ("schedule_changes"."type" = 'add' or "schedule_changes"."entry_id" is not null),
	CONSTRAINT "schedule_changes_add_time_check" CHECK ("schedule_changes"."type" <> 'add' or "schedule_changes"."slot_n" is not null or ("schedule_changes"."starts_at" is not null and "schedule_changes"."ends_at" is not null)),
	CONSTRAINT "schedule_changes_move_target_check" CHECK ("schedule_changes"."type" <> 'move' or ("schedule_changes"."new_date" is not null and ("schedule_changes"."new_slot_n" is not null or ("schedule_changes"."new_starts_at" is not null and "schedule_changes"."new_ends_at" is not null))))
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"slot_n" smallint NOT NULL,
	"parity" "week_parity" DEFAULT 'any' NOT NULL,
	"kind" "lesson_kind" NOT NULL,
	"room" text,
	"teacher" text,
	"valid_from" date,
	"valid_to" date,
	CONSTRAINT "schedule_entries_weekday_check" CHECK ("schedule_entries"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "schedule_entry_groups" (
	"entry_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "schedule_entry_groups_entry_id_group_id_pk" PRIMARY KEY("entry_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"first_week_parity" "week_parity" DEFAULT 'numerator' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	CONSTRAINT "semesters_first_week_parity_check" CHECK ("semesters"."first_week_parity" <> 'any')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"semester_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"teacher" text
);
--> statement-breakpoint
CREATE TABLE "time_slots" (
	"n" smallint PRIMARY KEY NOT NULL,
	"starts_at" time NOT NULL,
	"ends_at" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"pick_deadline" timestamp with time zone,
	"default_capacity" integer DEFAULT 1 NOT NULL,
	"rules" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_lists_default_capacity_check" CHECK ("topic_lists"."default_capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "topic_members" (
	"topic_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_members_topic_id_user_id_pk" PRIMARY KEY("topic_id","user_id"),
	CONSTRAINT "topic_members_one_per_list" UNIQUE("list_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"title" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"due_date" date,
	"due_order" integer,
	"is_done" boolean DEFAULT false NOT NULL,
	CONSTRAINT "topics_listId_n_unique" UNIQUE("list_id","n"),
	CONSTRAINT "topics_id_list_id_unique" UNIQUE("id","list_id"),
	CONSTRAINT "topics_capacity_check" CHECK ("topics"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"username" text,
	"photo_url" text,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"group_id" uuid,
	"has_access" boolean DEFAULT false NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"ical_token" text NOT NULL,
	"bot_started" boolean DEFAULT false NOT NULL,
	"notify_morning" boolean DEFAULT false NOT NULL,
	"notify_reminders" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_telegramId_unique" UNIQUE("telegram_id"),
	CONSTRAINT "users_icalToken_unique" UNIQUE("ical_token"),
	CONSTRAINT "users_theme_check" CHECK ("users"."theme" in ('system', 'light', 'dark'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_events" ADD CONSTRAINT "control_events_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_events" ADD CONSTRAINT "control_events_slot_n_time_slots_n_fk" FOREIGN KEY ("slot_n") REFERENCES "public"."time_slots"("n") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_events" ADD CONSTRAINT "control_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD CONSTRAINT "lesson_notes_slot_n_time_slots_n_fk" FOREIGN KEY ("slot_n") REFERENCES "public"."time_slots"("n") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_requests" ADD CONSTRAINT "login_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_requests" ADD CONSTRAINT "login_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_lesson_note_id_lesson_notes_id_fk" FOREIGN KEY ("lesson_note_id") REFERENCES "public"."lesson_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_suggested_subject_id_subjects_id_fk" FOREIGN KEY ("suggested_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_sorted_by_users_id_fk" FOREIGN KEY ("sorted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_change_groups" ADD CONSTRAINT "schedule_change_groups_change_id_schedule_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."schedule_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_change_groups" ADD CONSTRAINT "schedule_change_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD CONSTRAINT "schedule_changes_entry_id_schedule_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."schedule_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD CONSTRAINT "schedule_changes_slot_n_time_slots_n_fk" FOREIGN KEY ("slot_n") REFERENCES "public"."time_slots"("n") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD CONSTRAINT "schedule_changes_new_subject_id_subjects_id_fk" FOREIGN KEY ("new_subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD CONSTRAINT "schedule_changes_new_slot_n_time_slots_n_fk" FOREIGN KEY ("new_slot_n") REFERENCES "public"."time_slots"("n") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD CONSTRAINT "schedule_changes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_changes" ADD CONSTRAINT "schedule_changes_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_slot_n_time_slots_n_fk" FOREIGN KEY ("slot_n") REFERENCES "public"."time_slots"("n") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry_groups" ADD CONSTRAINT "schedule_entry_groups_entry_id_schedule_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."schedule_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entry_groups" ADD CONSTRAINT "schedule_entry_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_lists" ADD CONSTRAINT "topic_lists_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_lists" ADD CONSTRAINT "topic_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_members" ADD CONSTRAINT "topic_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_members" ADD CONSTRAINT "topic_members_topic_id_list_id_topics_id_list_id_fk" FOREIGN KEY ("topic_id","list_id") REFERENCES "public"."topics"("id","list_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_list_id_topic_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."topic_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_lesson_note_sort" ON "media" USING btree ("lesson_note_id","sort") WHERE "media"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_subject_materials" ON "media" USING btree ("subject_id") WHERE "media"."deleted_at" is null and "media"."lesson_note_id" is null;--> statement-breakpoint
CREATE INDEX "media_unsorted" ON "media" USING btree ("status") WHERE "media"."status" = 'unsorted' and "media"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_sha256_unique" ON "media" USING btree ("sha256") WHERE "media"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_tg_message_unique" ON "media" USING btree ("tg_chat_id","tg_message_id") WHERE "media"."tg_message_id" is not null;--> statement-breakpoint
CREATE INDEX "outbox_pending" ON "outbox" USING btree ("next_attempt_at") WHERE "outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "schedule_changes_date_active" ON "schedule_changes" USING btree ("date") WHERE "schedule_changes"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "schedule_changes_new_date_active" ON "schedule_changes" USING btree ("new_date") WHERE "schedule_changes"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_single_current" ON "semesters" USING btree ("is_current") WHERE "semesters"."is_current";--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");