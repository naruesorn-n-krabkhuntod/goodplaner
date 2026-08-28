import type { Prisma } from "@prisma/client";
import { Elysia, t } from "elysia";
import { assertCan } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { getBoard, itemCardInclude, planMembers } from "~/lib/plans";
import { rankBetween } from "~/lib/rank";
import { publishToPlan } from "~/lib/realtime";
import { planScope } from "~/plugins/plan-scope";
import { Checklist, CommentList, type ItemDetail, ItemDialog } from "~/views/item";

const detailInclude = {
  ...itemCardInclude,
  reporter: { select: { id: true, name: true, avatarUrl: true } },
  sprint: { select: { id: true, name: true } },
  column: { select: { id: true, name: true } },
  comments: {
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
  checklist: { orderBy: { position: "asc" } },
} satisfies Prisma.ItemInclude;

async function loadDialogData(planId: string, itemId: string) {
  const item = await db.item.findFirst({
    where: { id: itemId, planId },
    include: detailInclude,
  });
  if (!item) return null;

  const [board, sprints, members, labels] = await Promise.all([
    getBoard(planId),
    db.sprint.findMany({
      where: { planId, state: { not: "COMPLETED" } },
      orderBy: { position: "asc" },
      select: { id: true, name: true, state: true },
    }),
    planMembers(planId),
    db.label.findMany({ where: { planId }, orderBy: { name: "asc" } }),
  ]);

  return {
    item: item as unknown as ItemDetail,
    columns: board.columns,
    sprints,
    members: members.map((m) => m.user),
    labels,
  };
}

/** Parses an <input type="date"> value; empty string clears the field. */
function parseDate(value: string | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const itemRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  // ------------------------------------------------------------ open dialog
  .get("/items/:itemId", async ({ access, params, set }) => {
    const data = await loadDialogData(access.plan.id, params.itemId);
    if (!data) {
      set.status = 404;
      return "Item not found";
    }

    return (
      <ItemDialog
        item={data.item}
        slug={access.plan.slug}
        columns={data.columns}
        sprints={data.sprints}
        members={data.members}
        labels={data.labels}
        canEdit={access.can("editItems")}
        canComment={access.can("comment")}
      />
    );
  })

  // ---------------------------------------------------------- update fields
  .patch(
    "/items/:itemId",
    async ({ access, currentUser, params, body, set }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const item = await db.item.findFirst({
        where: { id: params.itemId, planId: plan.id },
        include: { column: true, assignee: true, sprint: true },
      });
      if (!item) {
        set.status = 404;
        return "Item not found";
      }

      const data: Prisma.ItemUpdateInput = {};
      let logAction: "item.updated" | "item.assigned" | "item.moved" | null = null;
      let meta: Record<string, unknown> = { key: item.key };

      if (body.title !== undefined && body.title.trim() && body.title !== item.title) {
        data.title = body.title.trim();
        logAction = "item.updated";
        meta = { ...meta, field: "title" };
      }

      if (body.description !== undefined && body.description !== (item.description ?? "")) {
        data.description = body.description || null;
        logAction = "item.updated";
        meta = { ...meta, field: "description" };
      }

      if (body.type !== undefined && body.type !== item.type) {
        data.type = body.type;
        logAction = "item.updated";
        meta = { ...meta, field: "type" };
      }

      if (body.priority !== undefined && body.priority !== item.priority) {
        data.priority = body.priority;
        logAction = "item.updated";
        meta = { ...meta, field: "priority" };
      }

      if (body.storyPoints !== undefined) {
        const points = body.storyPoints === "" ? null : Number(body.storyPoints);
        if (points === null || Number.isFinite(points)) {
          data.storyPoints = points;
          logAction = "item.updated";
          meta = { ...meta, field: "story points" };
        }
      }

      const due = parseDate(body.dueDate);
      if (due !== undefined) {
        data.dueDate = due;
        logAction = "item.updated";
        meta = { ...meta, field: "due date" };
      }

      if (body.assigneeId !== undefined) {
        const assigneeId = body.assigneeId || null;
        if (assigneeId !== item.assigneeId) {
          // Only members of this plan can be assigned.
          if (assigneeId) {
            const member = await db.planMember.findUnique({
              where: { planId_userId: { planId: plan.id, userId: assigneeId } },
              include: { user: { select: { name: true } } },
            });
            if (!member) {
              set.status = 400;
              return "That person is not a member of this plan";
            }
            meta = { ...meta, name: member.user.name };
          }
          data.assignee = assigneeId ? { connect: { id: assigneeId } } : { disconnect: true };
          logAction = "item.assigned";
        }
      }

      if (body.columnId !== undefined && body.columnId !== item.columnId) {
        const column = await db.column.findFirst({
          where: { id: body.columnId, board: { planId: plan.id } },
        });
        if (!column) {
          set.status = 400;
          return "Unknown column";
        }
        data.column = { connect: { id: column.id } };
        data.completedAt = column.category === "DONE" ? (item.completedAt ?? new Date()) : null;
        logAction = "item.moved";
        meta = { ...meta, from: item.column?.name ?? "Backlog", to: column.name };
      }

      if (body.sprintId !== undefined) {
        const sprintId = body.sprintId || null;
        if (sprintId !== item.sprintId) {
          if (sprintId) {
            const sprint = await db.sprint.findFirst({ where: { id: sprintId, planId: plan.id } });
            if (!sprint) {
              set.status = 400;
              return "Unknown sprint";
            }
          }
          data.sprint = sprintId ? { connect: { id: sprintId } } : { disconnect: true };
          logAction = "item.updated";
          meta = { ...meta, field: "sprint" };
        }
      }

      if (Object.keys(data).length === 0) {
        set.status = 204;
        return "";
      }

      await db.item.update({ where: { id: item.id }, data });

      if (logAction) {
        await logActivity({
          planId: plan.id,
          userId: currentUser.id,
          itemId: item.id,
          action: logAction,
          meta: meta as Prisma.InputJsonValue,
        });
      }

      publishToPlan(plan.id, "item.changed", { itemId: item.id, by: currentUser.id });

      set.status = 204;
      return "";
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ maxLength: 200 })),
        description: t.Optional(t.String({ maxLength: 20_000 })),
        type: t.Optional(
          t.Union([
            t.Literal("TASK"),
            t.Literal("STORY"),
            t.Literal("BUG"),
            t.Literal("EPIC"),
            t.Literal("CHORE"),
          ]),
        ),
        priority: t.Optional(
          t.Union([
            t.Literal("NONE"),
            t.Literal("LOW"),
            t.Literal("MEDIUM"),
            t.Literal("HIGH"),
            t.Literal("URGENT"),
          ]),
        ),
        storyPoints: t.Optional(t.String()),
        dueDate: t.Optional(t.String()),
        assigneeId: t.Optional(t.String()),
        columnId: t.Optional(t.String()),
        sprintId: t.Optional(t.String()),
      }),
    },
  )

  // ---------------------------------------------------------------- archive
  .post("/items/:itemId/archive", async ({ access, currentUser, params, set }) => {
    assertCan(access, "editItems");

    const item = await db.item.findFirst({
      where: { id: params.itemId, planId: access.plan.id },
    });
    if (!item) {
      set.status = 404;
      return "Item not found";
    }

    await db.item.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
    await logActivity({
      planId: access.plan.id,
      userId: currentUser.id,
      itemId: item.id,
      action: "item.archived",
      meta: { key: item.key, title: item.title },
    });

    publishToPlan(access.plan.id, "item.changed", { itemId: item.id, by: currentUser.id });

    // Empty response closes the dialog; the live region refreshes the board.
    set.headers["hx-trigger"] = JSON.stringify({ "gp:archived": { key: item.key } });
    return "";
  })

  // --------------------------------------------------------------- comments
  .post(
    "/items/:itemId/comments",
    async ({ access, currentUser, params, body, set }) => {
      assertCan(access, "comment");

      const item = await db.item.findFirst({
        where: { id: params.itemId, planId: access.plan.id },
      });
      if (!item) {
        set.status = 404;
        return "Item not found";
      }

      await db.comment.create({
        data: { itemId: item.id, userId: currentUser.id, body: body.body.trim() },
      });

      await logActivity({
        planId: access.plan.id,
        userId: currentUser.id,
        itemId: item.id,
        action: "item.commented",
        meta: { key: item.key },
      });

      publishToPlan(access.plan.id, "item.changed", { itemId: item.id, by: currentUser.id });

      const comments = await db.comment.findMany({
        where: { itemId: item.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      });

      return <CommentList comments={comments} />;
    },
    { body: t.Object({ body: t.String({ minLength: 1, maxLength: 5000 }) }) },
  )

  // -------------------------------------------------------------- checklist
  .post(
    "/items/:itemId/checklist",
    async ({ access, currentUser, params, body, set }) => {
      assertCan(access, "editItems");

      const item = await db.item.findFirst({
        where: { id: params.itemId, planId: access.plan.id },
      });
      if (!item) {
        set.status = 404;
        return "Item not found";
      }

      const last = await db.checklistItem.findFirst({
        where: { itemId: item.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      await db.checklistItem.create({
        data: {
          itemId: item.id,
          text: body.text.trim(),
          position: last ? rankBetween(last.position, null) : 0,
        },
      });

      await logActivity({
        planId: access.plan.id,
        userId: currentUser.id,
        itemId: item.id,
        action: "item.updated",
        meta: { key: item.key, field: "checklist" },
      });

      return renderChecklist(access.plan.slug, item.id, true);
    },
    { body: t.Object({ text: t.String({ minLength: 1, maxLength: 200 }) }) },
  )

  .post("/items/:itemId/checklist/:entryId/toggle", async ({ access, params, set }) => {
    assertCan(access, "editItems");

    const entry = await db.checklistItem.findFirst({
      where: { id: params.entryId, item: { id: params.itemId, planId: access.plan.id } },
    });
    if (!entry) {
      set.status = 404;
      return "Checklist entry not found";
    }

    await db.checklistItem.update({ where: { id: entry.id }, data: { done: !entry.done } });
    return renderChecklist(access.plan.slug, params.itemId, true);
  })

  .delete("/items/:itemId/checklist/:entryId", async ({ access, currentUser, params, set }) => {
    assertCan(access, "editItems");

    const entry = await db.checklistItem.findFirst({
      where: { id: params.entryId, item: { id: params.itemId, planId: access.plan.id } },
    });
    if (!entry) {
      set.status = 404;
      return "Checklist entry not found";
    }

    await db.checklistItem.delete({ where: { id: entry.id } });

    const item = await db.item.findUnique({ where: { id: params.itemId }, select: { key: true } });
    await logActivity({
      planId: access.plan.id,
      userId: currentUser.id,
      itemId: params.itemId,
      action: "item.updated",
      meta: { key: item?.key ?? "", field: "checklist" },
    });

    return renderChecklist(access.plan.slug, params.itemId, true);
  })

  // ----------------------------------------------------------------- labels
  .post("/items/:itemId/labels/:labelId", async ({ access, currentUser, params, set }) => {
    assertCan(access, "editItems");
    const { plan } = access;

    const [item, label] = await Promise.all([
      db.item.findFirst({ where: { id: params.itemId, planId: plan.id } }),
      db.label.findFirst({ where: { id: params.labelId, planId: plan.id } }),
    ]);
    if (!item || !label) {
      set.status = 404;
      return "Not found";
    }

    const existing = await db.itemLabel.findUnique({
      where: { itemId_labelId: { itemId: item.id, labelId: label.id } },
    });

    if (existing) {
      await db.itemLabel.delete({
        where: { itemId_labelId: { itemId: item.id, labelId: label.id } },
      });
    } else {
      await db.itemLabel.create({ data: { itemId: item.id, labelId: label.id } });
    }

    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      itemId: item.id,
      action: "item.labeled",
      meta: { key: item.key, label: label.name, action: existing ? "removed" : "added" },
    });

    publishToPlan(plan.id, "item.changed", { itemId: item.id });

    // Re-render the dialog so the chips reflect the new state.
    const data = await loadDialogData(plan.id, item.id);
    if (!data) return "";

    return (
      <ItemDialog
        item={data.item}
        slug={plan.slug}
        columns={data.columns}
        sprints={data.sprints}
        members={data.members}
        labels={data.labels}
        canEdit={access.can("editItems")}
        canComment={access.can("comment")}
      />
    );
  });

async function renderChecklist(slug: string, itemId: string, canEdit: boolean) {
  const entries = await db.checklistItem.findMany({
    where: { itemId },
    orderBy: { position: "asc" },
  });
  return <Checklist itemId={itemId} slug={slug} items={entries} canEdit={canEdit} />;
}
