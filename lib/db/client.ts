import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { paraDb?: Db };

/** Single connection pool per process (survives dev hot reloads). */
export function db(): Db {
  if (!globalForDb.paraDb) {
    const client = postgres(env().DATABASE_URL, { max: 10 });
    globalForDb.paraDb = drizzle(client, { schema, casing: "snake_case" });
  }
  return globalForDb.paraDb;
}
