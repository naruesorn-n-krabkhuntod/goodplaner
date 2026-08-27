import type { Prisma } from "@prisma/client";
import { db } from "~/lib/db";

/**
 * Append-only activity log. Every mutation that a teammate would want to see
 * writes one row here, and the Log view reads it back grouped by day.
 */

export type ActivityAction =
  | "plan.created"
  | "plan.updated"
  | "member.joined"
  | "member.removed"
  | "member.role_changed"
  | "invite.created"
  | "item.created"
  | "item.updated"
  | "item.moved"
  | "item.assigned"
  | "item.completed"
  | "item.reopened"
  | "item.archived"
  | "item.commented"
  | "sprint.created"
  | "sprint.updated"
  | "sprint.started"
  | "sprint.completed"
  | "sprint.item_added"
  | "sprint.item_removed"
  | "whiteboard.created"
  | "whiteboard.renamed"
  | "whiteboard.deleted";

interface LogInput {
  planId: string;
  userId: string | null;
  action: ActivityAction;
  itemId?: string | null;
  sprintId?: string | null;
  meta?: Prisma.InputJsonValue;
}

/**
 * Writes one log row. Swallows its own errors on purpose: losing a log line is
 * far better than failing the user's actual action.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    await db.activity.create({
      data: {
        planId: input.planId,
        userId: input.userId,
        action: input.action,
        itemId: input.itemId ?? null,
        sprintId: input.sprintId ?? null,
        meta: input.meta ?? {},
      },
    });
  } catch (error) {
    console.error("activity log failed", input.action, error);
  }
}

/** Human sentence for one log entry; the subject (the actor) is rendered separately. */
export function describeActivity(action: string, meta: Record<string, unknown>): string {
  const from = typeof meta.from === "string" ? meta.from : null;
  const to = typeof meta.to === "string" ? meta.to : null;
  const name = typeof meta.name === "string" ? meta.name : null;
  const field = typeof meta.field === "string" ? meta.field : null;

  switch (action) {
    case "plan.created":
      return "created this plan";
    case "plan.updated":
      return "updated the plan settings";

    case "member.joined":
      return name ? `added ${name}` : "joined the plan";
    case "member.removed":
      return name ? `removed ${name}` : "removed a member";
    case "member.role_changed":
      return name && to ? `changed ${name}'s role to ${to.toLowerCase()}` : "changed a member's role";
    case "invite.created":
      return "created an invite link";

    case "item.created":
      return "created";
    case "item.updated":
      return field ? `changed the ${field}` : "updated";
    case "item.moved":
      return from && to ? `moved from ${from} to ${to}` : "moved";
    case "item.assigned":
      return name ? `assigned to ${name}` : "cleared the assignee";
    case "item.completed":
      return "completed";
    case "item.reopened":
      return "reopened";
    case "item.archived":
      return "archived";
    case "item.commented":
      return "commented on";

    case "sprint.created":
      return name ? `created sprint ${name}` : "created a sprint";
    case "sprint.updated":
      return name ? `updated sprint ${name}` : "updated a sprint";
    case "sprint.started":
      return name ? `started sprint ${name}` : "started the sprint";
    case "sprint.completed":
      return name ? `completed sprint ${name}` : "completed the sprint";
    case "sprint.item_added":
      return name ? `added to ${name}` : "added to a sprint";
    case "sprint.item_removed":
      return "removed from the sprint";

    case "whiteboard.created":
      return name ? `created whiteboard ${name}` : "created a whiteboard";
    case "whiteboard.renamed":
      return name ? `renamed a whiteboard to ${name}` : "renamed a whiteboard";
    case "whiteboard.deleted":
      return name ? `deleted whiteboard ${name}` : "deleted a whiteboard";

    default:
      return action.replace(/[._]/g, " ");
  }
}
