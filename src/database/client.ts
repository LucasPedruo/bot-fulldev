import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export const sql = postgres(env.DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(sql, { schema });

export async function checkDatabase(): Promise<void> {
  await sql`select 1`;
}

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
