import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { Elysia, t } from "elysia";
import { env } from "~/env";
import { AccessError } from "~/lib/access";
import { db } from "~/lib/db";
import { bindRealtimeServer, planTopic } from "~/lib/realtime";
import { appRoutes } from "~/routes/app";
import { authRoutes } from "~/routes/auth";
import { backlogRoutes } from "~/routes/backlog";
import { boardRoutes } from "~/routes/board";
import { inviteRoutes } from "~/routes/invites";
import { itemRoutes } from "~/routes/items";
import { logRoutes } from "~/routes/log";
import { memberRoutes } from "~/routes/members";
import { sprintRoutes } from "~/routes/sprints";
import { whiteboardRoutes } from "~/routes/whiteboards";
import { session } from "~/plugins/session";
import { ErrorPage } from "~/views/pages/error";

/**
 * CSRF defence.
 *
 * Session cookies are SameSite=Lax, which already blocks cross-site form POSTs
 * from sending them. This is the belt to that braces: any state-changing
 * request must carry an Origin (or Referer) from our own host.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isSameOrigin(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return true;

  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) {
    // Same-origin fetch/XHR always sends Origin; a missing one is suspicious.
    return false;
  }

  try {
    return new URL(origin).origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}

export const app = new Elysia()
  .use(html())
  .use(
    staticPlugin({
      assets: "public",
      prefix: "",
      // Hashed filenames are not in use yet, so keep the window short.
      maxAge: env.isProduction ? 3600 : 0,
      alwaysStatic: false,
    }),
  )

  .onRequest(({ request, set }) => {
    if (isSameOrigin(request)) return;
    set.status = 403;
    return new Response("Cross-site request blocked.", { status: 403 });
  })

  // Defence-in-depth headers. No inline scripts are used except the theme
  // bootstrap, which is why script-src allows 'unsafe-inline' for now.
  .onAfterHandle(({ set }) => {
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["referrer-policy"] = "same-origin";
    set.headers["x-frame-options"] = "DENY";
  })

  .onError(({ error, code, set, request }) => {
    const wantsFragment = request.headers.get("hx-request") === "true";

    if (error instanceof AccessError) {
      set.status = error.status;
      return wantsFragment ? error.message : <ErrorPage status={error.status} message={error.message} />;
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return wantsFragment ? (
        "Not found"
      ) : (
        <ErrorPage status={404} message="We could not find that page." />
      );
    }

    if (code === "VALIDATION") {
      set.status = 422;
      return wantsFragment
        ? "That input was not valid."
        : <ErrorPage status={422} message="That input was not valid." />;
    }

    console.error(`[${code}]`, error);
    set.status = 500;
    return wantsFragment ? (
      "Something went wrong."
    ) : (
      <ErrorPage status={500} message="Something went wrong on our end." />
    );
  })

  // ------------------------------------------------------------------ routes
  .use(authRoutes)
  .use(inviteRoutes)
  .use(appRoutes)
  .use(boardRoutes)
  .use(backlogRoutes)
  .use(sprintRoutes)
  .use(itemRoutes)
  .use(whiteboardRoutes)
  .use(logRoutes)
  .use(memberRoutes)

  // --------------------------------------------------------------- realtime
  .use(session)
  .ws("/ws/plan/:planId", {
    params: t.Object({ planId: t.String() }),

    async open(ws) {
      // Subscribing is an authorisation decision: only members receive a plan's
      // events, so membership is checked before the socket joins the topic.
      const user = ws.data.user;
      if (!user) return ws.close(1008, "Not signed in");

      const membership = await db.planMember.findUnique({
        where: { planId_userId: { planId: ws.data.params.planId, userId: user.id } },
        select: { id: true },
      });
      if (!membership) return ws.close(1008, "Not a member of this plan");

      ws.subscribe(planTopic(ws.data.params.planId));
    },

    close(ws) {
      ws.unsubscribe(planTopic(ws.data.params.planId));
    },
  })

  /**
   * Readiness probe, used as Railway's health check.
   *
   * A 503 here fails a deploy, so the underlying error is logged rather than
   * swallowed: otherwise a bad DATABASE_URL surfaces only as an opaque
   * "Healthcheck failure" with nothing to go on.
   */
  .get("/healthz", async ({ set }) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      console.error("healthz: database unreachable —", error);
      set.status = 503;
      return {
        ok: false,
        error: "database unavailable",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });

// hostname 0.0.0.0 is required inside a container: binding to localhost would
// leave the app unreachable from Railway's proxy.
app.listen({ port: env.port, hostname: "0.0.0.0" }, (server) => {
  // Realtime publishing needs the Bun server handle, available only once listening.
  bindRealtimeServer(server);

  console.log(`\n  GoodPlanner running at ${env.appUrl} (listening on :${env.port})`);
  console.log(`  Google sign-in: ${env.google.configured ? "configured" : "NOT configured"}`);
  if (env.devAuthEnabled) {
    console.log("  Development sign-in is ENABLED (never available in production)");
  }
  console.log("");
});

export type App = typeof app;
