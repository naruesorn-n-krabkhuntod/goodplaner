import { Elysia, t } from "elysia";
import { env } from "~/env";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  buildGoogleAuthUrl,
  cookieOptions,
  createSession,
  destroySession,
  readCookie,
  safeNext,
  exchangeGoogleCode,
  upsertGoogleUser,
} from "~/lib/auth";
import { db } from "~/lib/db";
import { session } from "~/plugins/session";
import { AuthErrorPage, LandingPage } from "~/views/pages/landing";

export const authRoutes = new Elysia()
  .use(session)

  // Landing page, or straight through to the app when already signed in.
  .get("/", ({ user, query, redirect }) => {
    if (user) return redirect(safeNext(query.next), 303);
    return <LandingPage next={query.next} error={query.error} />;
  })

  // ---------------------------------------------------------------- google
  .get("/auth/google", async ({ query, cookie, redirect, set }) => {
    if (!env.google.configured) {
      set.status = 503;
      return <AuthErrorPage message="Google sign-in is not configured on this server." />;
    }

    const { url, state, codeVerifier, returnTo } = await buildGoogleAuthUrl(
      safeNext(query.next),
    );

    // State and PKCE verifier ride along in a short-lived cookie.
    cookie[OAUTH_STATE_COOKIE]?.set({
      value: JSON.stringify({ state, codeVerifier, returnTo }),
      ...cookieOptions,
      maxAge: 600,
    });

    return redirect(url, 303);
  })

  .get(
    "/auth/google/callback",
    async ({ query, cookie, redirect, request, set }) => {
      const stateCookie = cookie[OAUTH_STATE_COOKIE];
      const raw = stateCookie?.value;
      stateCookie?.remove();

      if (query.error) {
        return redirect(`/?error=${encodeURIComponent("Google sign-in was cancelled.")}`, 303);
      }

      if (!raw || !query.code || !query.state) {
        set.status = 400;
        return <AuthErrorPage message="The sign-in link was incomplete. Please try again." />;
      }

      let stored: { state: string; codeVerifier: string; returnTo: string };
      try {
        stored = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof stored);
      } catch {
        set.status = 400;
        return <AuthErrorPage message="The sign-in session was malformed. Please try again." />;
      }

      // CSRF: the state we issued must match the one Google echoed back.
      if (stored.state !== query.state) {
        set.status = 400;
        return <AuthErrorPage message="The sign-in request could not be verified. Please try again." />;
      }

      try {
        const profile = await exchangeGoogleCode(query.code, stored.codeVerifier);
        const user = await upsertGoogleUser(profile);
        const { id, expiresAt } = await createSession(
          user.id,
          request.headers.get("user-agent") ?? undefined,
        );

        cookie[SESSION_COOKIE]?.set({ value: id, ...cookieOptions, expires: expiresAt });
        return redirect(safeNext(stored.returnTo), 303);
      } catch (error) {
        console.error("google sign-in failed", error);
        set.status = 502;
        return (
          <AuthErrorPage message="Google could not confirm your account. Please try again in a moment." />
        );
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    },
  )

  // ------------------------------------------------------------------ dev
  // Guarded twice: the route is only registered when the flag is on, and the
  // flag itself can never be true while NODE_ENV=production (see src/env.ts).
  .guard({}, (app) =>
    env.devAuthEnabled
      ? app.post(
          "/auth/dev",
          async ({ body, cookie, redirect, request }) => {
            const email = body.email.toLowerCase().trim();
            const name = email.split("@")[0] ?? "Developer";

            const user = await db.user.upsert({
              where: { email },
              update: {},
              create: { email, name, googleId: `dev:${email}` },
            });

            const { id, expiresAt } = await createSession(
              user.id,
              request.headers.get("user-agent") ?? undefined,
            );
            cookie[SESSION_COOKIE]?.set({ value: id, ...cookieOptions, expires: expiresAt });

            return redirect(safeNext(body.next), 303);
          },
          {
            body: t.Object({
              email: t.String({ format: "email" }),
              next: t.Optional(t.String()),
            }),
          },
        )
      : app,
  )

  // ---------------------------------------------------------------- logout
  .post("/auth/logout", async ({ cookie, redirect }) => {
    await destroySession(readCookie(cookie, SESSION_COOKIE));
    cookie[SESSION_COOKIE]?.remove();
    return redirect("/", 303);
  });
