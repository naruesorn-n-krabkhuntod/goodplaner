import { Elysia, t } from "elysia";
import { assertCan } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { createItem, getBoard, itemCardInclude, planMembers, rankForDrop } from "~/lib/plans";
import { IndexField, toIndex } from "~/lib/schema";
import { publishToPlan } from "~/lib/realtime";
import { planScope } from "~/plugins/plan-scope";
import { Icon } from "~/views/icons";
import { ItemCard } from "~/views/item";
import { PlanLayout } from "~/views/plan-layout";
import { BoardColumnData, BoardEmpty, BoardRegion, ColumnHeader } from "~/views/pages/board";

/**
 * Board view.
 *
 * When a sprint is active the board shows that sprint only, which is what makes
 * it a scrum board rather than a dumping ground; otherwise it shows everything
 * that is not archived or already in a finished sprint.
 */
async function loadColumns(planId: string, activeSprintId: string | null): Promise<BoardColumnData[]> {
  const board = await getBoard(planId);

  const items = await db.item.findMany({
    where: {
      planId,
      archivedAt: null,
      ...(activeSprintId
        ? { sprintId: activeSprintId }
        : { OR: [{ sprintId: null }, { sprint: { state: { not: "COMPLETED" } } }] }),
    },
    include: itemCardInclude,
    orderBy: { rank: "asc" },
  });

  return board.columns.map((column) => ({
    column,
    items: items.filter((item) => item.columnId === column.id),
  }));
}

function activeSprintFor(planId: string) {
  return db.sprint.findFirst({ where: { planId, state: "ACTIVE" } });
}

export const boardRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  // -------------------------------------------------------------- full page
  .get("/board", async ({ access, currentUser, sidebarPlans }) => {
    const { plan } = access;
    const [activeSprint, membersRaw] = await Promise.all([
      activeSprintFor(plan.id),
      planMembers(plan.id),
    ]);
    const columns = await loadColumns(plan.id, activeSprint?.id ?? null);
    const members = membersRaw.map((m) => m.user);
    const canEdit = access.can("editItems");

    return (
      <PlanLayout
        user={currentUser}
        plans={sidebarPlans}
        plan={plan}
        tab="board"
        fixed
        actions={
          activeSprint ? (
            <span class="badge badge-accent" title="The board is scoped to the active sprint">
              <Icon name="sprint" size={12} />
              <span safe>{activeSprint.name}</span>
            </span>
          ) : (
            <a class="btn btn-secondary btn-sm" href={`/p/${plan.slug}/sprints`}>
              <Icon name="sprint" size={14} />
              Start a sprint
            </a>
          )
        }
      >
        {columns.length === 0 ? (
          <BoardEmpty />
        ) : (
          <BoardRegion plan={plan} columns={columns} activeSprint={activeSprint} canEdit={canEdit} members={members} />
        )}
      </PlanLayout>
    );
  })

  // ---------------------------------------------------------- board fragment
  .get("/board/fragment", async ({ access }) => {
    const { plan } = access;
    const [activeSprint, membersRaw] = await Promise.all([
      activeSprintFor(plan.id),
      planMembers(plan.id),
    ]);
    const columns = await loadColumns(plan.id, activeSprint?.id ?? null);

    return (
      <BoardRegion
        plan={plan}
        columns={columns}
        activeSprint={activeSprint}
        canEdit={access.can("editItems")}
        members={membersRaw.map((m) => m.user)}
      />
    );
  })

  // ------------------------------------------------------------------- move
  .post(
    "/board/move",
    async ({ access, currentUser, body, set }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const item = await db.item.findFirst({
        where: { id: body.itemId, planId: plan.id },
        include: { column: true },
      });
      if (!item) {
        set.status = 404;
        return "Item not found";
      }

      const targetColumn = await db.column.findFirst({
        where: { id: body.columnId, board: { planId: plan.id } },
      });
      if (!targetColumn) {
        set.status = 400;
        return "Unknown column";
      }

      const rank = await rankForDrop(
        { planId: plan.id, columnId: targetColumn.id },
        item.id,
        toIndex(body.index),
      );

      // Entering or leaving a DONE column is what marks an item complete.
      const wasDone = item.column?.category === "DONE";
      const isDone = targetColumn.category === "DONE";

      await db.item.update({
        where: { id: item.id },
        data: {
          columnId: targetColumn.id,
          rank,
          completedAt: isDone ? (item.completedAt ?? new Date()) : null,
        },
      });

      if (item.columnId !== targetColumn.id) {
        await logActivity({
          planId: plan.id,
          userId: currentUser.id,
          itemId: item.id,
          action: "item.moved",
          meta: { key: item.key, from: item.column?.name ?? "Backlog", to: targetColumn.name },
        });

        if (isDone && !wasDone) {
          await logActivity({
            planId: plan.id,
            userId: currentUser.id,
            itemId: item.id,
            action: "item.completed",
            meta: { key: item.key },
          });
        } else if (!isDone && wasDone) {
          await logActivity({
            planId: plan.id,
            userId: currentUser.id,
            itemId: item.id,
            action: "item.reopened",
            meta: { key: item.key },
          });
        }
      }

      publishToPlan(plan.id, "item.changed", { itemId: item.id, by: currentUser.id });

      // Refresh only the counts that could have changed.
      const affected = [...new Set([item.columnId, targetColumn.id])].filter(
        (id): id is string => Boolean(id),
      );

      const headers = await Promise.all(
        affected.map(async (columnId) => {
          const column = await db.column.findUnique({ where: { id: columnId } });
          if (!column) return null;
          const count = await db.item.count({
            where: { planId: plan.id, columnId, archivedAt: null },
          });
          return <ColumnHeader column={column} count={count} oob />;
        }),
      );

      return <>{headers}</>;
    },
    {
      body: t.Object({
        itemId: t.String({ minLength: 1 }),
        columnId: t.String({ minLength: 1 }),
        index: IndexField,
      }),
    },
  )

  // ----------------------------------------------------------- create item
  .post(
    "/items",
    async ({ access, currentUser, body }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const activeSprint = await activeSprintFor(plan.id);

      const item = await createItem(plan.id, currentUser.id, {
        title: body.title.trim(),
        columnId: body.columnId,
        assigneeId: body.assigneeId || null,
        // Items added from the board belong to whatever the board is showing.
        sprintId: activeSprint?.id ?? null,
      });

      const created = await db.item.findUnique({
        where: { id: item.id },
        include: itemCardInclude,
      });
      if (!created) return "";

      publishToPlan(plan.id, "item.changed", { itemId: created.id, by: currentUser.id });
      return <ItemCard item={created} slug={plan.slug} />;
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 200 }),
        columnId: t.String({ minLength: 1 }),
        assigneeId: t.Optional(t.String()),
      }),
    },
  );
