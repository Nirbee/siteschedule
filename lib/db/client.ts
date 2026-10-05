import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/** Driver-agnostic database handle (postgres.js in the app, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { paraDb?: Db };

/** Single connection pool per process (survives dev hot reloads). */
export function db(): Db {
  if (!globalForDb.paraDb) {
    const { DATABASE_URL, DATABASE_POOL_MAX } = env();
    const client = postgres(DATABASE_URL, { max: DATABASE_POOL_MAX });
    globalForDb.paraDb = drizzle(client, { schema, casing: "snake_case" }) as unknown as Db;
  }
  return globalForDb.paraDb;
}

/** Tests only: point services at an in-memory database. */
export function setDbForTesting(instance: Db | undefined): void {
  globalForDb.paraDb = instance;
}
