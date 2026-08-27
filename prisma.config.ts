// Prisma 7 no longer loads .env on its own; the CLI needs it before env() runs.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moved the Migrate connection URL out of schema.prisma and into here.
 * The runtime connection is separate: see src/lib/db.ts, which builds a
 * PrismaClient over the pg driver adapter.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun run prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
