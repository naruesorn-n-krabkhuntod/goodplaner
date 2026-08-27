import type { User } from "@prisma/client";
import { GOOGLE_REDIRECT_URI, env } from "~/env";
import { db } from "~/lib/db";

export const SESSION_COOKIE = "gp_session";
export const OAUTH_STATE_COOKIE = "gp_oauth";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * Elysia types cookie values as `unknown` unless the route declares a cookie
 * schema, so narrow once here instead of asserting at every call site.
 */
export function readCookie(
  jar: Record<string, { value?: unknown } | undefined>,
  name: string,
): string | undefined {
  const value = jar[name]?.value;
  return typeof value === "string" ? value : undefined;
}

/**
 * Only allow redirects to our own paths. Without this, an attacker-supplied
 * `?next=` would turn sign-in into an open redirect.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/app";

  // Must be rooted at a single slash. `//evil.com` is protocol-relative, and
  // some browsers normalise a backslash to a slash, so `/\evil.com` is too.
  if (!next.startsWith("/")) return "/app";
  if (next.startsWith("//")) return "/app";
  if (next.includes("\\")) return "/app";

  return next;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- sessions

export async function createSession(userId: string, userAgent?: string) {
  const id = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id, userId, expiresAt, userAgent } });
  return { id, expiresAt };
}

/** Returns the session's user, or null when missing/expired. Expired rows are reaped. */
export async function resolveSession(sessionId: string | undefined): Promise<User | null> {
  if (!sessionId) return null;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

export async function destroySession(sessionId: string | undefined) {
  if (!sessionId) return;
  await db.session.delete({ where: { id: sessionId } }).catch(() => {});
}

/** Cookie attributes shared by the session and OAuth-state cookies. */
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: env.isProduction,
} as const;

// ------------------------------------------------------------ google oauth

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/**
 * Builds the Google consent URL plus the CSRF state and PKCE verifier that must
 * be stored in a cookie and checked on the way back.
 */
export async function buildGoogleAuthUrl(returnTo?: string) {
  const state = randomToken(16);
  const codeVerifier = randomToken(32);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", env.google.clientId);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");

  return { url: url.toString(), state, codeVerifier, returnTo: returnTo ?? "/app" };
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Exchanges the authorization code for a profile. Throws on any failure. */
export async function exchangeGoogleCode(code: string, codeVerifier: string) {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status})`);
  }

  const { access_token } = (await tokenResponse.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google token response contained no access_token");

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!profileResponse.ok) {
    throw new Error(`Google userinfo failed (${profileResponse.status})`);
  }

  const profile = (await profileResponse.json()) as GoogleProfile;
  if (!profile.email) throw new Error("Google account has no email address");
  if (profile.email_verified === false) {
    throw new Error("Google account email is not verified");
  }

  return profile;
}

/**
 * Finds or creates the local user for a Google profile.
 *
 * Matching falls back to email so someone who signed in before a Google account
 * change is not duplicated; the googleId is then relinked to the existing row.
 */
export async function upsertGoogleUser(profile: GoogleProfile): Promise<User> {
  const email = profile.email.toLowerCase();
  const name = profile.name?.trim() || email.split("@")[0] || "Someone";

  const existing = await db.user.findFirst({
    where: { OR: [{ googleId: profile.sub }, { email }] },
  });

  if (existing) {
    return db.user.update({
      where: { id: existing.id },
      data: { googleId: profile.sub, email, name, avatarUrl: profile.picture ?? null },
    });
  }

  return db.user.create({
    data: { googleId: profile.sub, email, name, avatarUrl: profile.picture ?? null },
  });
}
