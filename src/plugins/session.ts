import { Elysia } from "elysia";
import type { User } from "@prisma/client";
import { SESSION_COOKIE, readCookie, resolveSession } from "~/lib/auth";
import { db } from "~/lib/db";

/**
 * Resolves the signed-in user (or null) for every request.
 * Global scope, so any route module can read `user` without opting in.
 */
export const session = new Elysia({ name: "session" }).derive(
  { as: "global" },
  async ({ cookie }) => ({
    user: await resolveSession(readCookie(cookie, SESSION_COOKIE)),
  }),
);

/**
 * Shared sign-in guard.
 *
 * Browser navigations are redirected to the landing page; htmx fragment
 * requests get a 401 with HX-Redirect so the client does a full page load
 * rather than swapping a login screen into a panel.
 *
 * Returns a Response to short-circuit the request, or undefined to continue.
 * Building the Response here keeps the helper independent of Elysia's context
 * type, which differs between the plugins that share it.
 */
export function requireSignIn(user: User | null, request: Request): Response | undefined {
  if (user) return;

  if (request.headers.get("hx-request") === "true") {
    return new Response("Your session has expired.", {
      status: 401,
      headers: { "hx-redirect": "/" },
    });
  }

  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 303,
    headers: { location: `/?next=${next}` },
  });
}

/** Plans listed in the sidebar on every signed-in page. */
export function sidebarPlansFor(userId: string) {
  return db.plan.findMany({
    where: { archivedAt: null, members: { some: { userId } } },
    select: { id: true, slug: true, name: true, emoji: true },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Requires a signed-in user and supplies the shell data.
 *
 * NOTE: `scoped` propagates exactly one level, so a module must `.use(authed)`
 * directly - re-exporting it through another plugin drops `currentUser`.
 * Plan routes therefore use `planScope`, which repeats this guard inline.
 */
export const authed = new Elysia({ name: "authed" })
  .use(session)
  .onBeforeHandle({ as: "scoped" }, ({ user, request }) => requireSignIn(user, request))
  .resolve({ as: "scoped" }, async ({ user }) => {
    // The guard above guarantees a user by this point.
    const currentUser = user!;
    return {
      currentUser,
      sidebarPlans: await sidebarPlansFor(currentUser.id),
    };
  });
