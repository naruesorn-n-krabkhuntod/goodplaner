import type { Role } from "@prisma/client";
import { Elysia, t } from "elysia";
import { env } from "~/env";
import { ROLE_DESCRIPTION, ROLE_LABEL, assertCan, hasRole } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { formatDate, relativeTime } from "~/lib/format";
import { planMembers } from "~/lib/plans";
import { publishToPlan } from "~/lib/realtime";
import { planScope } from "~/plugins/plan-scope";
import { Avatar } from "~/views/components";
import { Icon } from "~/views/icons";
import { PlanLayout } from "~/views/plan-layout";

const INVITE_TTL_DAYS = 14;
const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"];

function inviteToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

type MemberRow = Awaited<ReturnType<typeof planMembers>>[number];
type InviteRow = Awaited<ReturnType<typeof loadInvites>>[number];

function loadInvites(planId: string) {
  return db.invite.findMany({
    where: { planId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

// ------------------------------------------------------------------ views

function MembersRegion({
  slug,
  members,
  invites,
  currentUserId,
  viewerRole,
  canManage,
}: {
  slug: string;
  members: MemberRow[];
  invites: InviteRow[];
  currentUserId: string;
  viewerRole: Role;
  canManage: boolean;
}) {
  return (
    <div id="members" class="stack gap-6">
      <section>
        <div class="row gap-3" style="margin-bottom: var(--space-3)">
          <h2 class="section-title" style="margin:0">
            Members ({members.length})
          </h2>
        </div>

        <div class="item-list">
          {members.map((member) => (
            <MemberRow
              slug={slug}
              member={member}
              currentUserId={currentUserId}
              viewerRole={viewerRole}
              canManage={canManage}
            />
          ))}
        </div>
      </section>

      {canManage ? (
        <section>
          <h2 class="section-title">Invite people</h2>

          <form
            class="row gap-2"
            style="align-items:flex-end; margin-bottom: var(--space-4)"
            hx-post={`/p/${slug}/invites`}
            hx-target="#members"
            hx-swap="outerHTML"
          >
            <div class="field grow">
              <label class="label" for="invite-email">
                Email (optional)
              </label>
              <input
                id="invite-email"
                class="input"
                type="email"
                name="email"
                placeholder="Leave blank for a link anyone can use"
              />
            </div>
            <div class="field">
              <label class="label" for="invite-role">
                Role
              </label>
              <select id="invite-role" class="select" name="role">
                {ASSIGNABLE_ROLES.map((role) => (
                  <option value={role} selected={role === "MEMBER"}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" class="btn btn-primary">
              <Icon name="plus" size={15} />
              Create invite
            </button>
          </form>

          {invites.length > 0 ? (
            <div class="stack gap-2">
              {invites.map((invite) => (
                <InviteRow slug={slug} invite={invite} />
              ))}
            </div>
          ) : (
            <p class="text-sm text-tertiary">No pending invites.</p>
          )}

          <div class="card" style="margin-top: var(--space-5); padding: var(--space-4)">
            <h3 class="text-sm font-semibold" style="margin-bottom: var(--space-2)">
              What each role can do
            </h3>
            <dl class="stack gap-2 text-sm">
              {(["OWNER", "ADMIN", "MEMBER", "VIEWER"] as Role[]).map((role) => (
                <div class="row gap-2">
                  <dt class="badge" style="min-width:64px">
                    {ROLE_LABEL[role]}
                  </dt>
                  <dd class="text-secondary">{ROLE_DESCRIPTION[role]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MemberRow({
  slug,
  member,
  currentUserId,
  viewerRole,
  canManage,
}: {
  slug: string;
  member: MemberRow;
  currentUserId: string;
  viewerRole: Role;
  canManage: boolean;
}) {
  const isSelf = member.userId === currentUserId;
  // Nobody may act on someone at or above their own rank, and the owner is fixed.
  const editable =
    canManage && member.role !== "OWNER" && !isSelf && hasRole(viewerRole, member.role);

  return (
    <div class="member-row">
      <Avatar user={member.user} size="lg" />

      <div class="grow" style="min-width:0">
        <p class="font-medium truncate" safe>
          {member.user.name}
          {isSelf ? " (you)" : ""}
        </p>
        <p class="text-sm text-tertiary truncate" safe>
          {member.user.email}
        </p>
      </div>

      <span class="text-xs text-tertiary">Joined {formatDate(member.createdAt)}</span>

      {editable ? (
        <select
          class="select"
          style="width:auto"
          name="role"
          aria-label={`Role for ${member.user.name}`}
          hx-patch={`/p/${slug}/members/${member.userId}`}
          hx-target="#members"
          hx-swap="outerHTML"
        >
          {ASSIGNABLE_ROLES.map((role) => (
            <option value={role} selected={role === member.role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
      ) : (
        <span class="badge">{ROLE_LABEL[member.role]}</span>
      )}

      {editable ? (
        <button
          type="button"
          class="btn btn-icon"
          aria-label={`Remove ${member.user.name}`}
          data-tooltip="Remove"
          hx-delete={`/p/${slug}/members/${member.userId}`}
          hx-confirm={`Remove ${member.user.name} from this plan?`}
          hx-target="#members"
          hx-swap="outerHTML"
        >
          <Icon name="trash" size={15} />
        </button>
      ) : null}
    </div>
  );
}

function InviteRow({ slug, invite }: { slug: string; invite: InviteRow }) {
  const url = `${env.appUrl}/i/${invite.token}`;

  return (
    <div class="row gap-2">
      <div class="invite-link-box grow">
        <Icon name="link" size={14} />
        <span class="truncate grow" safe>
          {url}
        </span>
      </div>

      <span class="badge">{ROLE_LABEL[invite.role]}</span>

      {invite.email ? (
        <span class="badge" title="Only this address can accept" safe>
          {invite.email}
        </span>
      ) : null}

      <button
        type="button"
        class="btn btn-secondary btn-sm"
        data-copy={url}
      >
        <Icon name="copy" size={14} />
        Copy
      </button>

      <button
        type="button"
        class="btn btn-icon"
        aria-label="Revoke invite"
        data-tooltip="Revoke"
        hx-delete={`/p/${slug}/invites/${invite.id}`}
        hx-target="#members"
        hx-swap="outerHTML"
      >
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------- routes

async function renderMembers(
  planId: string,
  slug: string,
  currentUserId: string,
  viewerRole: Role,
  canManage: boolean,
) {
  const [members, invites] = await Promise.all([
    planMembers(planId),
    canManage ? loadInvites(planId) : Promise.resolve([]),
  ]);

  return (
    <MembersRegion
      slug={slug}
      members={members}
      invites={invites}
      currentUserId={currentUserId}
      viewerRole={viewerRole}
      canManage={canManage}
    />
  );
}

export const memberRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  .get("/members", async ({ access, currentUser, sidebarPlans }) => {
    const { plan, role } = access;
    const canManage = access.can("manageMembers");

    return (
      <PlanLayout user={currentUser} plans={sidebarPlans} plan={plan} tab="members">
        <div class="page-inner">
          {await renderMembers(plan.id, plan.slug, currentUser.id, role, canManage)}
        </div>
      </PlanLayout>
    );
  })

  // ------------------------------------------------------------ create invite
  .post(
    "/invites",
    async ({ access, currentUser, body }) => {
      assertCan(access, "manageMembers");
      const { plan, role } = access;

      const inviteRole = (body.role ?? "MEMBER") as Role;
      // Never let someone mint an invite more powerful than themselves.
      const safeRole: Role = hasRole(role, inviteRole) ? inviteRole : "MEMBER";

      await db.invite.create({
        data: {
          planId: plan.id,
          token: inviteToken(),
          email: body.email?.trim().toLowerCase() || null,
          role: safeRole,
          invitedById: currentUser.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        },
      });

      await logActivity({
        planId: plan.id,
        userId: currentUser.id,
        action: "invite.created",
        meta: { role: safeRole },
      });

      return renderMembers(plan.id, plan.slug, currentUser.id, role, true);
    },
    {
      body: t.Object({
        email: t.Optional(t.String({ maxLength: 200 })),
        role: t.Optional(
          t.Union([t.Literal("ADMIN"), t.Literal("MEMBER"), t.Literal("VIEWER")]),
        ),
      }),
    },
  )

  .delete("/invites/:inviteId", async ({ access, currentUser, params }) => {
    assertCan(access, "manageMembers");
    const { plan, role } = access;

    await db.invite.deleteMany({ where: { id: params.inviteId, planId: plan.id } });
    return renderMembers(plan.id, plan.slug, currentUser.id, role, true);
  })

  // ------------------------------------------------------------- change role
  .patch(
    "/members/:userId",
    async ({ access, currentUser, params, body, set }) => {
      assertCan(access, "manageMembers");
      const { plan, role } = access;

      const target = await db.planMember.findUnique({
        where: { planId_userId: { planId: plan.id, userId: params.userId } },
        include: { user: { select: { name: true } } },
      });
      if (!target) {
        set.status = 404;
        return "Member not found";
      }

      // Owners are immovable, you cannot change your own role, and you cannot
      // act on anyone ranked at or above you.
      if (target.role === "OWNER" || target.userId === currentUser.id || !hasRole(role, target.role)) {
        set.status = 403;
        return "You cannot change that member's role.";
      }

      const nextRole = body.role as Role;
      if (!hasRole(role, nextRole)) {
        set.status = 403;
        return "You cannot grant a role above your own.";
      }

      await db.planMember.update({
        where: { planId_userId: { planId: plan.id, userId: target.userId } },
        data: { role: nextRole },
      });

      await logActivity({
        planId: plan.id,
        userId: currentUser.id,
        action: "member.role_changed",
        meta: { name: target.user.name, to: nextRole },
      });
      publishToPlan(plan.id, "member.changed", { userId: target.userId });

      return renderMembers(plan.id, plan.slug, currentUser.id, role, true);
    },
    {
      body: t.Object({
        role: t.Union([t.Literal("ADMIN"), t.Literal("MEMBER"), t.Literal("VIEWER")]),
      }),
    },
  )

  // ----------------------------------------------------------- remove member
  .delete("/members/:userId", async ({ access, currentUser, params, set }) => {
    assertCan(access, "manageMembers");
    const { plan, role } = access;

    const target = await db.planMember.findUnique({
      where: { planId_userId: { planId: plan.id, userId: params.userId } },
      include: { user: { select: { name: true } } },
    });
    if (!target) {
      set.status = 404;
      return "Member not found";
    }

    if (target.role === "OWNER" || target.userId === currentUser.id || !hasRole(role, target.role)) {
      set.status = 403;
      return "You cannot remove that member.";
    }

    await db.planMember.delete({
      where: { planId_userId: { planId: plan.id, userId: target.userId } },
    });

    await logActivity({
      planId: plan.id,
      userId: currentUser.id,
      action: "member.removed",
      meta: { name: target.user.name },
    });
    publishToPlan(plan.id, "member.changed", { userId: target.userId });

    return renderMembers(plan.id, plan.slug, currentUser.id, role, true);
  });
