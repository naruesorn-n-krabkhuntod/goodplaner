import type { Plan } from "@prisma/client";
import { Elysia, t } from "elysia";
import { type PlanAccess, assertCan } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { buildBurndown, sprintStats } from "~/lib/burndown";
import { db } from "~/lib/db";
import { publishToPlan } from "~/lib/realtime";
import { loadBacklogGroups } from "~/lib/views-data";
import { planScope } from "~/plugins/plan-scope";
import { Icon } from "~/views/icons";
import { PlanLayout } from "~/views/plan-layout";
import { BacklogRegion } from "~/views/pages/backlog";
import { type SprintCardData, SprintsRegion } from "~/views/pages/sprints";

async function loadSprints(planId: string): Promise<SprintCardData[]> {
  const sprints = await db.sprint.findMany({
    where: { planId },
    // Active first, then planned, then completed; newest within each state.
    orderBy: [{ state: "asc" }, { position: "desc" }],
    include: {
      items: {
        where: { archivedAt: null },
        select: { storyPoints: true, completedAt: true },
      },
    },
  });

  return sprints.map((sprint) => ({
    sprint,
    stats: sprintStats(sprint.items, sprint.endDate),
    burndown:
      sprint.startDate && sprint.endDate && sprint.state !== "PLANNED"
        ? buildBurndown(sprint.items, sprint.startDate, sprint.endDate)
        : null,
  }));
}

/**
 * The start / complete / create buttons appear on both the sprints page and
 * the backlog page. htmx tells us which region asked, so we reply with that one.
 */
async function regionForRequest(request: Request, plan: Plan, access: PlanAccess) {
  if (request.headers.get("hx-target") === "backlog") {
    const groups = await loadBacklogGroups(plan.id);
    return (
      <BacklogRegion
        plan={plan}
        groups={groups}
        canEdit={access.can("editItems")}
        canManageSprints={access.can("manageSprints")}
      />
    );
  }

  const sprints = await loadSprints(plan.id);
  return (
    <SprintsRegion plan={plan} sprints={sprints} canManage={access.can("manageSprints")} />
  );
}

function parseDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const sprintRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  .get("/sprints", async ({ access, currentUser, sidebarPlans }) => {
    const { plan } = access;
    const sprints = await loadSprints(plan.id);

    return (
      <PlanLayout
        user={currentUser}
        plans={sidebarPlans}
        plan={plan}
        tab="sprints"
        actions={
          access.can("manageSprints") ? (
            <button
              type="button"
              class="btn btn-primary btn-sm"
              hx-post={`/p/${plan.slug}/sprints`}
              hx-target="#sprints"
              hx-swap="outerHTML"
            >
              <Icon name="plus" size={14} />
              New sprint
            </button>
          ) : null
        }
      >
        <div class="page-inner">
          <SprintsRegion plan={plan} sprints={sprints} canManage={access.can("manageSprints")} />
        </div>
      </PlanLayout>
    );
  })

  .get("/sprints/fragment", async ({ access }) => {
    const sprints = await loadSprints(access.plan.id);
    return (
      <SprintsRegion
        plan={access.plan}
        sprints={sprints}
        canManage={access.can("manageSprints")}
      />
    );
  })

  // --------------------------------------------------------------- create
  .post("/sprints", async ({ access, currentUser, request }) => {
    assertCan(access, "manageSprints");
    const { plan } = access;

    const last = await db.sprint.findFirst({
      where: { planId: plan.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? -1) + 1;

    // Default to a two-week window starting today.
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 13 * 86_400_000);

    const sprint = await db.sprint.create({
      data: { planId: plan.id, name: `Sprint ${position + 1}`, position, startDate, endDate },
    });

    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      sprintId: sprint.id,
      action: "sprint.created",
      meta: { name: sprint.name },
    });
    publishToPlan(plan.id, "sprint.changed", { sprintId: sprint.id });

    return regionForRequest(request, plan, access);
  })

  // ---------------------------------------------------------------- update
  .patch(
    "/sprints/:sprintId",
    async ({ access, currentUser, params, body, request, set }) => {
      assertCan(access, "manageSprints");

      const sprint = await db.sprint.findFirst({
        where: { id: params.sprintId, planId: access.plan.id },
      });
      if (!sprint) {
        set.status = 404;
        return "Sprint not found";
      }

      const startDate = parseDate(body.startDate);
      const endDate = parseDate(body.endDate);

      // A sprint that ends before it starts would break the burndown maths.
      const nextStart = startDate === undefined ? sprint.startDate : startDate;
      const nextEnd = endDate === undefined ? sprint.endDate : endDate;
      if (nextStart && nextEnd && nextEnd.getTime() < nextStart.getTime()) {
        set.status = 422;
        set.headers["hx-toast"] = JSON.stringify({
          message: "The end date must fall after the start date.",
          variant: "error",
        });
        return "";
      }

      const name = body.name?.trim() || sprint.name;

      await db.sprint.update({
        where: { id: sprint.id },
        data: {
          name,
          goal: body.goal !== undefined ? body.goal.trim() || null : undefined,
          startDate,
          endDate,
        },
      });

      await logActivity({
        planId: access.plan.id,
        userId: currentUser.id,
        sprintId: sprint.id,
        action: "sprint.updated",
        meta: { name },
      });
      publishToPlan(access.plan.id, "sprint.changed", { sprintId: sprint.id });

      return regionForRequest(request, access.plan, access);
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 80 })),
        goal: t.Optional(t.String({ maxLength: 500 })),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    },
  )

  // ----------------------------------------------------------------- start
  .post("/sprints/:sprintId/start", async ({ access, currentUser, params, request, set }) => {
    assertCan(access, "manageSprints");
    const { plan } = access;

    const sprint = await db.sprint.findFirst({
      where: { id: params.sprintId, planId: plan.id },
    });
    if (!sprint) {
      set.status = 404;
      return "Sprint not found";
    }

    // Only one sprint can be active - that is what keeps the board unambiguous.
    const running = await db.sprint.findFirst({ where: { planId: plan.id, state: "ACTIVE" } });
    if (running && running.id !== sprint.id) {
      set.status = 409;
      set.headers["hx-toast"] = JSON.stringify({
        message: `${running.name} is still active. Complete it before starting another.`,
        variant: "error",
      });
      return "";
    }

    await db.sprint.update({
      where: { id: sprint.id },
      data: { state: "ACTIVE", startDate: sprint.startDate ?? new Date() },
    });

    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      sprintId: sprint.id,
      action: "sprint.started",
      meta: { name: sprint.name },
    });
    publishToPlan(plan.id, "sprint.changed", { sprintId: sprint.id });

    return regionForRequest(request, plan, access);
  })

  // -------------------------------------------------------------- complete
  .post("/sprints/:sprintId/complete", async ({ access, currentUser, params, request, set }) => {
    assertCan(access, "manageSprints");
    const { plan } = access;

    const sprint = await db.sprint.findFirst({
      where: { id: params.sprintId, planId: plan.id },
    });
    if (!sprint) {
      set.status = 404;
      return "Sprint not found";
    }

    // Unfinished work returns to the backlog rather than vanishing with the sprint.
    const carried = await db.item.updateMany({
      where: { sprintId: sprint.id, completedAt: null, archivedAt: null },
      data: { sprintId: null },
    });

    await db.sprint.update({
      where: { id: sprint.id },
      data: { state: "COMPLETED", completedAt: new Date() },
    });

    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      sprintId: sprint.id,
      action: "sprint.completed",
      meta: { name: sprint.name, carriedOver: carried.count },
    });
    publishToPlan(plan.id, "sprint.changed", { sprintId: sprint.id });

    set.headers["hx-toast"] = JSON.stringify({
      message:
        carried.count > 0
          ? `${sprint.name} completed. ${carried.count} unfinished ${
              carried.count === 1 ? "item" : "items"
            } moved back to the backlog.`
          : `${sprint.name} completed with everything done.`,
      variant: "success",
    });

    return regionForRequest(request, plan, access);
  });
