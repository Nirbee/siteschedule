CREATE TABLE "topic_class_access" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_class_access_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "topic_lists" ADD COLUMN "class_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_lists" ADD COLUMN "class_secret" text;--> statement-breakpoint
ALTER TABLE "topic_lists" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_lists" ADD COLUMN "announced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "topic_class_access" ADD CONSTRAINT "topic_class_access_list_id_topic_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."topic_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_class_access" ADD CONSTRAINT "topic_class_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;