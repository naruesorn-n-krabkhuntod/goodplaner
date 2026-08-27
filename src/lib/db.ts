import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "~/env";

/**
 * Prisma 7 talks to Postgres through a driver adapter rather than a Rust engine,
 * so the connection string is supplied here instead of in schema.prisma.
 *
 * The instance is cached on globalThis because `bun --watch` re-evaluates modules
 * on every save; without this each reload would open a fresh pool and leak sockets.
 */
const adapter = new PrismaPg({ connectionString: env.databaseUrl });

const globalForPrisma = globalThis as unknown as { __db?: PrismaClient };

export const db =
  globalForPrisma.__db ??
  new PrismaClient({
    adapter,
    log: env.isProduction ? ["error"] : ["warn", "error"],
  });

if (!env.isProduction) globalForPrisma.__db = db;
