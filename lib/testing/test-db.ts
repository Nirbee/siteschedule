// In-memory Postgres (PGlite) with real migrations, for service tests.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { setDbForTesting, type Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const instance = drizzle(client, { schema, casing: "snake_case" });
  await migrate(instance, { migrationsFolder: "drizzle" });
  const db = instance as unknown as Db;
  setDbForTesting(db);
  return {
    db,
    close: async () => {
      setDbForTesting(undefined);
      await client.close();
    },
  };
}

const TABLES = [
  "audit_log",
  "outbox",
  "news",
  "media_pages",
  "media",
  "lesson_notes",
  "topic_members",
  "topics",
  "topic_lists",
  "task_materials",
  "assignment_done",
  "assignments",
  "control_events",
  "schedule_change_groups",
  "schedule_changes",
  "schedule_entry_groups",
  "schedule_entries",
  "subjects",
  "time_slots",
  "semesters",
  "login_requests",
  "sessions",
  "users",
  "groups",
];

export async function resetTestDb(db: Db): Promise<void> {
  await db.execute(sql.raw(`truncate table ${TABLES.join(", ")} restart identity cascade`));
}
