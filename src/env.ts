/**
 * Environment parsing. Fails loudly at boot rather than at the first request,
 * so a misconfigured deploy never reaches users.
 */

function required(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return Bun.env[name] || fallback;
}

const NODE_ENV = optional("NODE_ENV", "development");
const isProduction = NODE_ENV === "production";

/**
 * Dev-only sign-in that skips Google. Requires BOTH a non-production NODE_ENV
 * and an explicit opt-in, so it can never be switched on by accident in prod.
 */
const devAuthEnabled = !isProduction && optional("DEV_AUTH_ENABLED", "false") === "true";

// Google credentials are only mandatory when they are the sole way in.
const googleConfigured = Boolean(Bun.env.GOOGLE_CLIENT_ID && Bun.env.GOOGLE_CLIENT_SECRET);
if (!googleConfigured && !devAuthEnabled) {
  throw new Error(
    "No sign-in method is available.\n" +
      "  Either set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see .env.example),\n" +
      "  or set DEV_AUTH_ENABLED=true for a local development login.",
  );
}

export const env = {
  NODE_ENV,
  isProduction,
  port: Number(optional("PORT", "3000")),
  appUrl: optional("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  google: {
    configured: googleConfigured,
    clientId: optional("GOOGLE_CLIENT_ID", ""),
    clientSecret: optional("GOOGLE_CLIENT_SECRET", ""),
  },
  devAuthEnabled,
} as const;

export const GOOGLE_REDIRECT_URI = `${env.appUrl}/auth/google/callback`;
