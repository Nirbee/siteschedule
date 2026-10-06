CREATE TABLE "grade_marks" (
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_marks_user_id_subject_id_key_pk" PRIMARY KEY("user_id","subject_id","key")
);
--> statement-breakpoint
CREATE TABLE "grading_schemes" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_subjects" (
	"teacher_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "teacher_subjects_teacher_id_subject_id_pk" PRIMARY KEY("teacher_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"photo_key" text,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grade_marks" ADD CONSTRAINT "grade_marks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_marks" ADD CONSTRAINT "grade_marks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;