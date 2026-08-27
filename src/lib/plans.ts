import type { ItemType, Prisma, Priority } from "@prisma/client";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { deriveKey, slugify } from "~/lib/format";
import { rankBetween } from "~/lib/rank";

/** Domain operations shared by the route handlers. */

const DEFAULT_COLUMNS = [
  { name: "To do", category: "TODO" as const, position: 0, wipLimit: null },
  { name: "In progress", category: "IN_PROGRESS" as const, position: 1, wipLimit: 5 },
  { name: "In review", category: "IN_PROGRESS" as const, position: 2, wipLimit: 3 },
  { name: "Done", category: "DONE" as const, position: 3, wipLimit: null },
];

const DEFAULT_LABELS = [
  { name: "bug", color: "red" },
  { name: "feature", color: "green" },
  { name: "design", color: "purple" },
  { name: "urgent", color: "orange" },
];

/** Finds a free slug, appending -2, -3 ... on collision. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await db.plan.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface CreatePlanInput {
  name: string;
  description?: string | null;
  emoji?: string;
  color?: string;
}

/**
 * Creates a plan with its owner membership, a default board and starter labels,
 * all in one transaction so a half-built workspace can never exist.
 */
export async function createPlan(userId: string, input: CreatePlanInput) {
  const slug = await uniqueSlug(input.name);

  const plan = await db.$transaction(async (tx) => {
    const created = await tx.plan.create({
      data: {
        slug,
        key: deriveKey(input.name),
        name: input.name,
        description: input.description ?? null,
        emoji: input.emoji ?? "\u{1F4CB}",
        color: input.color ?? "blue",
        members: { create: { userId, role: "OWNER" } },
        labels: { createMany: { data: DEFAULT_LABELS } },
      },
    });

    await tx.board.create({
      data: {
        planId: created.id,
        name: "Board",
        isDefault: true,
        columns: { createMany: { data: DEFAULT_COLUMNS } },
      },
    });

    return created;
  });

  await logActivity({ planId: plan.id, userId, action: "plan.created" });
  return plan;
}

/** The plan's default board plus its ordered columns. */
export async function getBoard(planId: string) {
  const board = await db.board.findFirst({
    where: { planId },
    orderBy: { createdAt: "asc" },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  if (board) return board;

  // Self-heal: a plan created before boards existed, or a deleted board.
  return db.board.create({
    data: {
      planId,
      name: "Board",
      isDefault: true,
      columns: { createMany: { data: DEFAULT_COLUMNS } },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });
}

export interface CreateItemInput {
  title: string;
  type?: ItemType;
  priority?: Priority;
  description?: string | null;
  columnId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  storyPoints?: number | null;
  dueDate?: Date | null;
  /** Place at the top of its list instead of the bottom. */
  atTop?: boolean;
}

/**
 * Creates an item, allocating the next per-plan number under a transaction so
 * two concurrent creates cannot claim the same key.
 */
export async function createItem(planId: string, userId: string, input: CreateItemInput) {
  const board = await getBoard(planId);
  const columnId = input.columnId ?? board.columns[0]?.id ?? null;

  const rank = await nextRank(planId, { columnId, sprintId: input.sprintId ?? null }, input.atTop);

  const item = await db.$transaction(async (tx) => {
    const plan = await tx.plan.update({
      where: { id: planId },
      data: { itemCounter: { increment: 1 } },
      select: { itemCounter: true, key: true },
    });

    return tx.item.create({
      data: {
        planId,
        boardId: board.id,
        columnId,
        number: plan.itemCounter,
        key: `${plan.key}-${plan.itemCounter}`,
        title: input.title,
        description: input.description ?? null,
        type: input.type ?? "TASK",
        priority: input.priority ?? "NONE",
        storyPoints: input.storyPoints ?? null,
        assigneeId: input.assigneeId ?? null,
        reporterId: userId,
        sprintId: input.sprintId ?? null,
        dueDate: input.dueDate ?? null,
        rank,
      },
    });
  });

  await logActivity({
    planId,
    userId,
    itemId: item.id,
    action: "item.created",
    meta: { key: item.key, title: item.title },
  });

  return item;
}

/** Rank that puts a new item at the top or bottom of its list. */
async function nextRank(
  planId: string,
  where: { columnId: string | null; sprintId: string | null },
  atTop = false,
): Promise<number> {
  const neighbour = await db.item.findFirst({
    where: { planId, archivedAt: null, columnId: where.columnId },
    orderBy: { rank: atTop ? "asc" : "desc" },
    select: { rank: true },
  });

  if (!neighbour) return 0;
  return atTop ? rankBetween(null, neighbour.rank) : rankBetween(neighbour.rank, null);
}

/**
 * Computes the rank for an item dropped at `index` of the destination list.
 * The moving item is excluded so the index lines up with what the user saw.
 */
export async function rankForDrop(
  where: Prisma.ItemWhereInput,
  movingItemId: string,
  index: number,
): Promise<number> {
  const siblings = await db.item.findMany({
    where: { ...where, archivedAt: null, id: { not: movingItemId } },
    orderBy: { rank: "asc" },
    select: { rank: true },
  });

  const before = index > 0 ? (siblings[index - 1]?.rank ?? null) : null;
  const after = index < siblings.length ? (siblings[index]?.rank ?? null) : null;

  return rankBetween(before, after);
}

/** Standard include for anything that renders an item card or row. */
export const itemCardInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  labels: { include: { label: true } },
  _count: { select: { comments: true, children: true } },
} satisfies Prisma.ItemInclude;

export type ItemCard = Prisma.ItemGetPayload<{ include: typeof itemCardInclude }>;

/** Members of a plan, for assignee pickers and avatar stacks. */
export function planMembers(planId: string) {
  return db.planMember.findMany({
    where: { planId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}
