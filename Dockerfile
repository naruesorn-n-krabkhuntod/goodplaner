# Pinned to the Bun version the app is developed and tested against.
# Debian-based rather than Alpine: Prisma's engines are happier against glibc.
FROM oven/bun:1.4 AS base
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Copied on their own so a source-only change does not reinstall the world.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma generate` only reads the schema, so no database is needed here.
RUN bun run build

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# The generated Prisma client lives inside node_modules, so it is carried over
# with it rather than regenerated at boot.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Railway injects PORT; this is documentation, not a binding.
EXPOSE 3000

# Applies pending migrations, then serves. See package.json.
CMD ["bun", "run", "start"]
