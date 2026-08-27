import { Elysia, t } from "elysia";
import { assertCan } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { createItem, rankForDrop } from "~/lib/plans";
import { IndexField, toIndex } from "~/lib/schema";
import { publishToPlan } from "~/lib/realtime";
import { loadBacklogGroups } from "~/lib/views-data";
import { planScope } from "~/plugins/plan-scope";
import { Icon } from "~/views/icons";
import { PlanLayout } from "~/views/plan-layout";
import { BacklogRegion } from "~/views/pages/backlog";

export const backlogRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  .get("/backlog", async ({ access, currentUser, sidebarPlans }) => {
    const { plan } = access;
    const groups = await loadBacklogGroups(plan.id);

    return (
      <PlanLayout
        user={currentUser}
        plans={sidebarPlans}
        plan={plan}
        tab="backlog"
        actions={
          access.can("manageSprints") ? (
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              hx-post={`/p/${plan.slug}/sprints`}
              hx-target="#backlog"
              hx-swap="outerHTML"
            >
              <Icon name="plus" size={14} />
              New sprint
            </button>
          ) : null
        }
      >
        <div class="page-inner page-wide">
          <BacklogRegion
            plan={plan}
            groups={groups}
            canEdit={access.can("editItems")}
            canManageSprints={access.can("manageSprints")}
          />
        </div>
      </PlanLayout>
    );
  })

  .get("/backlog/fragment", async ({ access }) => {
    const groups = await loadBacklogGroups(access.plan.id);
    return (
      <BacklogRegion
        plan={access.plan}
        groups={groups}
        canEdit={access.can("editItems")}
        canManageSprints={access.can("manageSprints")}
      />
    );
  })

  // ---------------------------------------------------- move between sprints
  .post(
    "/backlog/move",
    async ({ access, currentUser, body, set }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const item = await db.item.findFirst({
        where: { id: body.itemId, planId: plan.id },
        include: { sprint: true },
      });
      if (!item) {
        set.status = 404;
        return "Item not found";
      }

      const sprintId = body.sprintId || null;

      if (sprintId) {
        const sprint = await db.sprint.findFirst({
          where: { id: sprintId, planId: plan.id, state: { not: "COMPLETED" } },
        });
        if (!sprint) {
          set.status = 400;
          return "Unknown sprint";
        }
      }

      const rank = await rankForDrop({ planId: plan.id, sprintId }, item.id, toIndex(body.index));

      await db.item.update({ where: { id: item.id }, data: { sprintId, rank } });

      if (item.sprintId !== sprintId) {
        const target = sprintId
          ? await db.sprint.findUnique({ where: { id: sprintId }, select: { name: true } })
          : null;

        await logActivity({
          planId: plan.id,
          userId: currentUser.id,
          itemId: item.id,
          sprintId,
          action: sprintId ? "sprint.item_added" : "sprint.item_removed",
          meta: { key: item.key, name: target?.name ?? null },
        });
      }

      publishToPlan(plan.id, "item.changed", { itemId: item.id, by: currentUser.id });

      set.status = 204;
      return "";
    },
    {
      body: t.Object({
        itemId: t.String({ minLength: 1 }),
        sprintId: t.String(),
        index: IndexField,
      }),
    },
  )

  // ------------------------------------------------ create straight to backlog
  .post(
    "/backlog/items",
    async ({ access, currentUser, body }) => {
      assertCan(access, "editItems");

      await createItem(access.plan.id, currentUser.id, {
        title: body.title.trim(),
        sprintId: null,
      });

      publishToPlan(access.plan.id, "item.changed", { by: currentUser.id });

      const groups = await loadBacklogGroups(access.plan.id);
      return (
        <BacklogRegion
          plan={access.plan}
          groups={groups}
          canEdit={access.can("editItems")}
          canManageSprints={access.can("manageSprints")}
        />
      );
    },
    { body: t.Object({ title: t.String({ minLength: 1, maxLength: 200 }) }) },
  );
