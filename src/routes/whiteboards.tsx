import type { Prisma } from "@prisma/client";
import { Elysia, t } from "elysia";
import { assertCan } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { publishToPlan } from "~/lib/realtime";
import { planScope } from "~/plugins/plan-scope";
import { Icon } from "~/views/icons";
import { PlanLayout } from "~/views/plan-layout";
import {
  WhiteboardActions,
  WhiteboardCanvas,
  WhiteboardGrid,
  WhiteboardTitle,
} from "~/views/pages/whiteboard";

/** Roughly 2MB of JSON, which is a very large hand-drawn board. */
const MAX_SCENE_BYTES = 2_000_000;

const SHAPE_TYPES = new Set(["pen", "rect", "ellipse", "arrow", "note", "text"]);

/**
 * The scene is client-authored JSON, so it is validated before it is stored:
 * unknown shape types are dropped and the payload is size-capped. Text is not
 * sanitised here because it is only ever drawn onto a canvas, never inserted
 * as HTML.
 */
function sanitiseScene(scene: unknown): Prisma.InputJsonValue | null {
  if (!Array.isArray(scene)) return null;
  if (scene.length > 5000) return null;

  const cleaned = scene.filter(
    (shape): shape is Prisma.InputJsonObject =>
      typeof shape === "object" &&
      shape !== null &&
      !Array.isArray(shape) &&
      typeof (shape as Record<string, unknown>).type === "string" &&
      SHAPE_TYPES.has((shape as Record<string, unknown>).type as string),
  );

  if (JSON.stringify(cleaned).length > MAX_SCENE_BYTES) return null;
  return cleaned;
}

export const whiteboardRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  // ------------------------------------------------------------------ index
  .get("/whiteboards", async ({ access, currentUser, sidebarPlans }) => {
    const { plan } = access;

    const boards = await db.whiteboard.findMany({
      where: { planId: plan.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    return (
      <PlanLayout
        user={currentUser}
        plans={sidebarPlans}
        plan={plan}
        tab="whiteboards"
        actions={
          access.can("editItems") ? (
            <form hx-post={`/p/${plan.slug}/whiteboards`} hx-swap="none">
              <button type="submit" class="btn btn-primary btn-sm">
                <Icon name="plus" size={14} />
                New whiteboard
              </button>
            </form>
          ) : null
        }
      >
        <div class="page-inner page-wide">
          <WhiteboardGrid plan={plan} boards={boards} canEdit={access.can("editItems")} />
        </div>
      </PlanLayout>
    );
  })

  // ----------------------------------------------------------------- create
  .post("/whiteboards", async ({ access, currentUser, set }) => {
    assertCan(access, "editItems");
    const { plan } = access;

    const count = await db.whiteboard.count({ where: { planId: plan.id } });
    const board = await db.whiteboard.create({
      data: {
        planId: plan.id,
        createdById: currentUser.id,
        name: count === 0 ? "Untitled board" : `Untitled board ${count + 1}`,
      },
    });

    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      action: "whiteboard.created",
      meta: { name: board.name, whiteboardId: board.id },
    });

    // Straight into the new canvas.
    set.headers["hx-redirect"] = `/p/${plan.slug}/whiteboards/${board.id}`;
    set.status = 204;
    return "";
  })

  // ------------------------------------------------------------------ open
  .get("/whiteboards/:boardId", async ({ access, currentUser, sidebarPlans, params, set }) => {
    const { plan } = access;

    const board = await db.whiteboard.findFirst({
      where: { id: params.boardId, planId: plan.id },
    });
    if (!board) {
      set.status = 404;
      return "Whiteboard not found";
    }

    const canEdit = access.can("editItems");

    return (
      <PlanLayout
        user={currentUser}
        plans={sidebarPlans}
        plan={plan}
        tab="whiteboards"
        trail={board.name}
        fixed
        actions={
          <>
            <WhiteboardTitle slug={plan.slug} board={board} canEdit={canEdit} />
            {canEdit ? <WhiteboardActions slug={plan.slug} boardId={board.id} /> : null}
          </>
        }
      >
        <WhiteboardCanvas plan={plan} board={board} canEdit={canEdit} />
        <script src="/js/whiteboard.js" type="module" defer />
      </PlanLayout>
    );
  })

  // ------------------------------------------------------------- save scene
  .post(
    "/whiteboards/:boardId/scene",
    async ({ access, currentUser, params, body, set }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const board = await db.whiteboard.findFirst({
        where: { id: params.boardId, planId: plan.id },
        select: { id: true },
      });
      if (!board) {
        set.status = 404;
        return { error: "Whiteboard not found" };
      }

      const scene = sanitiseScene(body.scene);
      if (scene === null) {
        set.status = 422;
        return { error: "That drawing is too large or malformed to save." };
      }

      await db.whiteboard.update({
        where: { id: board.id },
        data: { scene },
      });

      // Other viewers replace their canvas unless they have unsaved edits.
      publishToPlan(plan.id, "whiteboard.updated", {
        whiteboardId: board.id,
        scene,
        by: currentUser.id,
      });

      return { ok: true };
    },
    { body: t.Object({ scene: t.Unknown() }) },
  )

  // ---------------------------------------------------------------- rename
  .patch(
    "/whiteboards/:boardId",
    async ({ access, currentUser, params, body, set }) => {
      assertCan(access, "editItems");
      const { plan } = access;

      const board = await db.whiteboard.findFirst({
        where: { id: params.boardId, planId: plan.id },
      });
      if (!board) {
        set.status = 404;
        return "Whiteboard not found";
      }

      const name = body.name.trim() || board.name;
      if (name !== board.name) {
        await db.whiteboard.update({ where: { id: board.id }, data: { name } });
        await logActivity({
          planId: plan.id,
          userId: currentUser.id,
          action: "whiteboard.renamed",
          meta: { name, whiteboardId: board.id },
        });
      }

      set.status = 204;
      return "";
    },
    { body: t.Object({ name: t.String({ maxLength: 80 }) }) },
  )

  // ---------------------------------------------------------------- delete
  .delete("/whiteboards/:boardId", async ({ access, currentUser, params, set }) => {
    assertCan(access, "editItems");
    const { plan } = access;

    const board = await db.whiteboard.findFirst({
      where: { id: params.boardId, planId: plan.id },
    });
    if (!board) {
      set.status = 404;
      return "Whiteboard not found";
    }

    await db.whiteboard.delete({ where: { id: board.id } });
    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      action: "whiteboard.deleted",
      meta: { name: board.name },
    });

    set.headers["hx-redirect"] = `/p/${plan.slug}/whiteboards`;
    set.status = 204;
    return "";
  });
