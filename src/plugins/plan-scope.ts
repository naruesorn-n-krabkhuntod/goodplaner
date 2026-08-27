import { Elysia } from "elysia";
import { loadPlanAccess } from "~/lib/access";
import { requireSignIn, session, sidebarPlansFor } from "~/plugins/session";

/**
 * Everything a route under `/p/:slug` needs: the signed-in user, their sidebar
 * plans, and their membership of this plan.
 *
 * The sign-in guard is repeated here rather than composed from `authed`
 * because Elysia's `scoped` lifecycle only propagates one level - nesting
 * `authed` inside this plugin would leave `currentUser` undefined in the route
 * modules that mount it.
 *
 * `loadPlanAccess` throws AccessError (404 for plans you cannot see, 403 for
 * ones you can but may not change); the handler in src/index.tsx renders those.
 */
export const planScope = new Elysia({ name: "planScope" })
  .use(session)
  .onBeforeHandle({ as: "scoped" }, ({ user, request }) => requireSignIn(user, request))
  .resolve({ as: "scoped" }, async ({ user, params }) => {
    const currentUser = user!;
    // Safe cast: this plugin is only ever mounted beneath a `:slug` segment.
    const { slug } = params as { slug: string };

    const [access, sidebarPlans] = await Promise.all([
      loadPlanAccess(currentUser.id, slug),
      sidebarPlansFor(currentUser.id),
    ]);

    return { currentUser, sidebarPlans, access };
  });
