// Prisma 7 no longer loads .env on its own; the CLI needs it before the config
// is evaluated.
import "dotenv/config";
import { defineConfig } from "prisma/config";

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
    // Read directly rather than through prisma's `env()` helper, which throws
    // during config load when the variable is absent. `prisma generate` needs
    // no connection, so a missing URL must not break `bun run build` on a
    // fresh clone or a deploy that generates before the database is attached.
    // Migrate commands still fail loudly on their own when it is missing.
    url: process.env.DATABASE_URL ?? "",
  },
});
