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
 * The public origin. Everything user-facing is built from it: the Google
 * redirect URI and the invite links people paste to each other, so it has to
 * be the address a browser on the open internet can actually reach.
 *
 * Railway sets RAILWAY_PUBLIC_DOMAIN as soon as the service has a domain, so
 * the origin can be inferred rather than pasted in by hand. Without that there
 * is a chicken-and-egg: you cannot know the domain until the service exists,
 * but the service will not boot without APP_URL.
 */
const platformDomain = Bun.env.RAILWAY_PUBLIC_DOMAIN;

/**
 * Accepts a bare host as well as a full origin. Railway's domain variables are
 * bare, so anyone wiring APP_URL to one ends up with a scheme-less value.
 */
function toOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${isProduction ? "https" : "http"}://${trimmed}`;
}

/**
 * Hosts that resolve only inside a private network. Railway's own
 * RAILWAY_PRIVATE_DOMAIN is `<service>.railway.internal`, which is easy to pick
 * by mistake and produces failures far from their cause: Google rejects such a
 * redirect_uri outright, and invite links point somewhere nobody can open.
 */
const NON_PUBLIC_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1]?)$|\.(internal|local|localhost)$/i;

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

let appUrl = toOrigin(
  Bun.env.APP_URL ||
    platformDomain ||
    (isProduction
      ? required("APP_URL") // throws with a useful message
      : "http://localhost:3000"),
);

// Recover from a private host when the platform tells us the public one;
// otherwise refuse, because everything downstream would fail confusingly.
if (isProduction && NON_PUBLIC_HOST.test(hostOf(appUrl))) {
  if (platformDomain && !NON_PUBLIC_HOST.test(platformDomain)) {
    console.warn(
      `\n  WARNING: APP_URL is ${appUrl}, which is only reachable inside the\n` +
        `  private network. Using the public domain ${platformDomain} instead.\n` +
        "  Set APP_URL to the public URL, or remove it to infer this automatically.\n",
    );
    appUrl = toOrigin(platformDomain);
  } else {
    throw new Error(
      `APP_URL is ${appUrl}, which is not reachable from the public internet.\n` +
        "  Google will reject an OAuth redirect_uri on that host, and invite links\n" +
        "  would point somewhere nobody can open.\n" +
        "  On Railway use RAILWAY_PUBLIC_DOMAIN (e.g. myapp.up.railway.app),\n" +
        "  not RAILWAY_PRIVATE_DOMAIN (*.railway.internal).",
    );
  }
}

if (isProduction && !appUrl.startsWith("https://")) {
  throw new Error(
    `APP_URL must be an https:// origin in production (got ${appUrl}). ` +
      "Session cookies are set Secure and browsers will drop them over http.",
  );
}

// The reverse mistake: deployed on a public https origin but NODE_ENV was never
// set, so cookies are not Secure and the dev sign-in door could be open. Warn
// rather than throw, because someone may legitimately be pointing a tunnel at a
// local dev server.
if (!isProduction && appUrl.startsWith("https://")) {
  console.warn(
    "\n  WARNING: APP_URL is https:// but NODE_ENV is not 'production'.\n" +
      "  Session cookies will not be marked Secure. Set NODE_ENV=production.\n",
  );
}

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
  // Railway (and most PaaS) inject PORT; bind to whatever they give us.
  port: Number(optional("PORT", "3000")),
  appUrl,
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
