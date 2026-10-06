CREATE TABLE "assignment_done" (
	"assignment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_done_assignment_id_user_id_pk" PRIMARY KEY("assignment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"due_slot_n" smallint,
	"due_starts_at" time,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "assignments_due_time_check" CHECK ("assignments"."due_slot_n" is null or "assignments"."due_starts_at" is null)
);
--> statement-breakpoint
CREATE TABLE "task_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid,
	"control_event_id" uuid,
	"media_id" uuid,
	"lesson_note_id" uuid,
	"page" integer,
	"url" text,
	"title" text,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_materials_owner_check" CHECK (num_nonnulls("task_materials"."assignment_id", "task_materials"."control_event_id") = 1),
	CONSTRAINT "task_materials_target_check" CHECK (num_nonnulls("task_materials"."media_id", "task_materials"."lesson_note_id", "task_materials"."url") = 1),
	CONSTRAINT "task_materials_page_check" CHECK ("task_materials"."page" is null or "task_materials"."page" >= 1)
);
--> statement-breakpoint
ALTER TABLE "control_events" ADD COLUMN "topics" text;--> statement-breakpoint
ALTER TABLE "control_events" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "control_events" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignment_done" ADD CONSTRAINT "assignment_done_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_done" ADD CONSTRAINT "assignment_done_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_due_slot_n_time_slots_n_fk" FOREIGN KEY ("due_slot_n") REFERENCES "public"."time_slots"("n") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_materials" ADD CONSTRAINT "task_materials_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_materials" ADD CONSTRAINT "task_materials_control_event_id_control_events_id_fk" FOREIGN KEY ("control_event_id") REFERENCES "public"."control_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_materials" ADD CONSTRAINT "task_materials_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_materials" ADD CONSTRAINT "task_materials_lesson_note_id_lesson_notes_id_fk" FOREIGN KEY ("lesson_note_id") REFERENCES "public"."lesson_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_due" ON "assignments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "task_materials_assignment" ON "task_materials" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "task_materials_control_event" ON "task_materials" USING btree ("control_event_id");