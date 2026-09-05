import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://fulldev:fulldev@localhost:5432/fulldev_bot"
  },
  strict: true,
  verbose: true
});
