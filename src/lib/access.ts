import type { Plan, Role } from "@prisma/client";
import { db } from "~/lib/db";

/**
 * Plan authorisation.
 *
 * Roles are a strict ladder, so every check is "is my rank at least X".
 * Route handlers call `assertCan` before any mutation.
 */

const RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export type Capability =
  | "view"
  | "comment"
  | "editItems"
  | "manageSprints"
  | "manageBoard"
  | "manageMembers"
  | "managePlan"
  | "deletePlan";

const REQUIRED: Record<Capability, Role> = {
  view: "VIEWER",
  comment: "MEMBER",
  editItems: "MEMBER",
  manageSprints: "MEMBER",
  manageBoard: "ADMIN",
  manageMembers: "ADMIN",
  managePlan: "ADMIN",
  deletePlan: "OWNER",
};

export interface PlanAccess {
  plan: Plan;
  role: Role;
  can: (capability: Capability) => boolean;
}

export class AccessError extends Error {
  constructor(
    readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export function hasRole(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

export function can(role: Role, capability: Capability): boolean {
  return hasRole(role, REQUIRED[capability]);
}

/**
 * Loads a plan the user belongs to. Throws 404 rather than 403 for plans the
 * user is not a member of, so the endpoint does not confirm they exist.
 */
export async function loadPlanAccess(userId: string, slug: string): Promise<PlanAccess> {
  const plan = await db.plan.findUnique({ where: { slug } });
  if (!plan || plan.archivedAt) {
    throw new AccessError(404, "Plan not found");
  }

  const membership = await db.planMember.findUnique({
    where: { planId_userId: { planId: plan.id, userId } },
  });
  if (!membership) {
    throw new AccessError(404, "Plan not found");
  }

  return {
    plan,
    role: membership.role,
    can: (capability) => can(membership.role, capability),
  };
}

/** Throws 403 when the role is insufficient. */
export function assertCan(access: PlanAccess, capability: Capability): void {
  if (!access.can(capability)) {
    throw new AccessError(403, `Your role (${access.role.toLowerCase()}) cannot do that.`);
  }
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Full control, including deleting the plan.",
  ADMIN: "Manage members, board columns and plan settings.",
  MEMBER: "Create and edit work items, sprints and whiteboards.",
  VIEWER: "Read-only access.",
};
