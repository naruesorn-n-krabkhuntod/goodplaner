import type { Plan } from "@prisma/client";
import { Elysia, t } from "elysia";
import { type PlanAccess, assertCan } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { buildBurndown, sprintStats } from "~/lib/burndown";
import { db } from "~/lib/db";
import { publishToPlan } from "~/lib/realtime";
import { loadBacklogGroups } from "~/lib/views-data";
import { planScope } from "~/plugins/plan-scope";
import { PlanLayout } from "~/views/plan-layout";
import { BacklogRegion } from "~/views/pages/backlog";
import { type SprintCardData, SprintsRegion } from "~/views/pages/sprints";
import { TypeMark } from "~/views/components";

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
  .post(
    "/sprints",
    async ({ access, currentUser, request, body, set }) => {
      assertCan(access, "manageSprints");
      const { plan } = access;

      // Only one active sprint at a time — a second would make the board ambiguous.
      const active = await db.sprint.findFirst({
        where: { planId: plan.id, state: "ACTIVE" },
        select: { name: true },
      });
      if (active) {
        set.status = 409;
        set.headers["hx-toast"] = JSON.stringify({
          message: `${active.name} is still active. Complete it before creating a new sprint.`,
          variant: "error",
        });
        return regionForRequest(request, plan, access);
      }

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

      // If the caller passed itemIds, move those items straight into the sprint.
      // htmx sends repeated fields as either an array or a single string
      // depending on how many were selected; normalise to an array.
      const rawIds = body?.itemIds;
      const itemIds: string[] = Array.isArray(rawIds)
        ? rawIds
        : rawIds
          ? [rawIds]
          : [];
      if (itemIds.length > 0) {
        await db.item.updateMany({
          where: { id: { in: itemIds }, planId: plan.id, archivedAt: null },
          data: { sprintId: sprint.id },
        });
        await logActivity({
          planId: plan.id,
          userId: currentUser.id,
          sprintId: sprint.id,
          action: "sprint.item_added",
          meta: { name: sprint.name, count: itemIds.length },
        });
      }

      await logActivity({
        planId: plan.id,
        userId: currentUser.id,
        sprintId: sprint.id,
        action: "sprint.created",
        meta: { name: sprint.name },
      });
      publishToPlan(plan.id, "sprint.changed", { sprintId: sprint.id });

      return regionForRequest(request, plan, access);
    },
    {
      body: t.Optional(
        t.Object({
          itemIds: t.Optional(
            t.Union([t.Array(t.String()), t.String()]),
          ),
        }),
      ),
    },
  )

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
  })

  // ----------------------------------------- add backlog items to a sprint
  .post(
    "/sprints/:sprintId/add-items",
    async ({ access, currentUser, params, body, request, set }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const sprint = await db.sprint.findFirst({
        where: { id: params.sprintId, planId: plan.id, state: { not: "COMPLETED" } },
      });
      if (!sprint) {
        set.status = 404;
        return "Sprint not found";
      }

      const raw = body.itemIds;
      const itemIds: string[] = Array.isArray(raw) ? raw : [raw];
      if (itemIds.length === 0) {
        set.status = 400;
        return "No items selected";
      }

      await db.item.updateMany({
        where: { id: { in: itemIds }, planId: plan.id, archivedAt: null, sprintId: null },
        data: { sprintId: sprint.id },
      });

      await logActivity({
        planId: plan.id,
        userId: currentUser.id,
        sprintId: sprint.id,
        action: "sprint.item_added",
        meta: { name: sprint.name, count: itemIds.length },
      });
      publishToPlan(plan.id, "item.changed", { by: currentUser.id });

      return regionForRequest(request, plan, access);
    },
    {
      body: t.Object({
        itemIds: t.Union([t.Array(t.String(), { minItems: 1 }), t.String({ minLength: 1 })]),
      }),
    },
  )

  // --------------------------------------- backlog items for the picker modal
  .get("/sprints/:sprintId/backlog-candidates", async ({ access, params, set }) => {
    const sprint = await db.sprint.findFirst({
      where: { id: params.sprintId, planId: access.plan.id, state: { not: "COMPLETED" } },
    });
    if (!sprint) {
      set.status = 404;
      return "Sprint not found";
    }

    const items = await db.item.findMany({
      where: { planId: access.plan.id, sprintId: null, archivedAt: null, completedAt: null },
      select: { id: true, key: true, title: true, type: true, priority: true, storyPoints: true },
      orderBy: { rank: "asc" },
    });

    return <BacklogCandidateList items={items} sprintId={sprint.id} slug={access.plan.slug} />
  });

// ============================================================= components

interface CandidateItem {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  storyPoints: number | null;
}

function BacklogCandidateList({
  items,
  sprintId,
  slug,
}: {
  items: CandidateItem[];
  sprintId: string;
  slug: string;
}) {
  return (
    <div id="backlog-candidate-list">
      {items.length === 0 ? (
        <p class="text-sm text-tertiary" style="padding: var(--space-4); text-align: center;">
          No backlog items available. All items are already in a sprint.
        </p>
      ) : (
        <ul class="candidate-list">
          {items.map((item) => (
            <li class="candidate-row">
              <label class="candidate-label">
                <input
                  type="checkbox"
                  class="checkbox"
                  name="itemIds"
                  value={item.id}
                  form="add-items-form"
                />
                <TypeMark type={item.type as never} />
                <span class="item-row-key text-xs text-tertiary" safe>
                  {item.key}
                </span>
                <span class="candidate-title truncate" safe>
                  {item.title}
                </span>
                {item.storyPoints ? (
                  <span class="points" title="Story points">
                    {item.storyPoints}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
