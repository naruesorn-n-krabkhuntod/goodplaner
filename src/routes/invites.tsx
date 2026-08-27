import type { Children } from "@kitajs/html";
import { Elysia } from "elysia";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "~/lib/access";
import { logActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { publishToPlan } from "~/lib/realtime";
import { session } from "~/plugins/session";
import { Icon } from "~/views/icons";
import { PublicShell } from "~/views/layout";

/**
 * Invite acceptance.
 *
 * The token is the credential, so the landing page confirms what joining means
 * before any membership is written - a GET must never mutate.
 */

function InviteShell({ children }: { children?: Children }) {
  return (
    <PublicShell title="Invitation - GoodPlanner">
      <div class="auth-shell">
        <div class="auth-card">{children}</div>
      </div>
    </PublicShell>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <InviteShell>
      <div class="empty-icon" style="margin:0 auto">
        <Icon name="alert" size={22} />
      </div>
      <h1 class="card-title">This invite cannot be used</h1>
      <p class="text-secondary" safe>
        {message}
      </p>
      <a class="btn btn-secondary btn-block" href="/app">
        Go to my plans
      </a>
    </InviteShell>
  );
}

export const inviteRoutes = new Elysia()
  .use(session)

  .get("/i/:token", async ({ params, user, redirect, set }) => {
    // Signing in first, then coming straight back here.
    if (!user) {
      return redirect(`/?next=${encodeURIComponent(`/i/${params.token}`)}`, 303);
    }

    const invite = await db.invite.findUnique({
      where: { token: params.token },
      include: {
        plan: { select: { id: true, slug: true, name: true, emoji: true, description: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invite) {
      set.status = 404;
      return <InviteError message="That invite link is not valid." />;
    }

    if (invite.acceptedAt) {
      set.status = 410;
      return <InviteError message="That invite has already been used." />;
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      set.status = 410;
      return <InviteError message="That invite has expired. Ask for a new link." />;
    }

    if (invite.email && invite.email !== user.email.toLowerCase()) {
      set.status = 403;
      return (
        <InviteError
          message={`This invite was issued for ${invite.email}, but you are signed in as ${user.email}.`}
        />
      );
    }

    // Already a member: nothing to accept, just go there.
    const existing = await db.planMember.findUnique({
      where: { planId_userId: { planId: invite.planId, userId: user.id } },
    });
    if (existing) return redirect(`/p/${invite.plan.slug}/board`, 303);

    return (
      <InviteShell>
        <div class="plan-card-emoji" style="margin:0 auto" safe>
          {invite.plan.emoji}
        </div>

        <h1 class="card-title">
          Join <span safe>{invite.plan.name}</span>
        </h1>

        <p class="text-secondary">
          <span safe>{invite.invitedBy.name}</span> invited you as a{" "}
          <strong>{ROLE_LABEL[invite.role].toLowerCase()}</strong>.
          <br />
          {ROLE_DESCRIPTION[invite.role]}
        </p>

        {invite.plan.description ? (
          <p class="text-sm text-tertiary" safe>
            {invite.plan.description}
          </p>
        ) : null}

        <form method="post" action={`/i/${params.token}/accept`}>
          <button type="submit" class="btn btn-primary btn-block btn-lg">
            Accept invitation
          </button>
        </form>

        <a class="btn btn-ghost btn-block" href="/app">
          Not now
        </a>
      </InviteShell>
    );
  })

  .post("/i/:token/accept", async ({ params, user, redirect, set }) => {
    if (!user) {
      return redirect(`/?next=${encodeURIComponent(`/i/${params.token}`)}`, 303);
    }

    const invite = await db.invite.findUnique({
      where: { token: params.token },
      include: { plan: { select: { id: true, slug: true, name: true } } },
    });

    if (
      !invite ||
      invite.acceptedAt ||
      invite.expiresAt.getTime() < Date.now() ||
      (invite.email && invite.email !== user.email.toLowerCase())
    ) {
      set.status = 410;
      return <InviteError message="That invite is no longer valid." />;
    }

    await db.$transaction(async (tx) => {
      await tx.planMember.upsert({
        where: { planId_userId: { planId: invite.planId, userId: user.id } },
        update: {},
        create: { planId: invite.planId, userId: user.id, role: invite.role },
      });

      // Email-pinned invites are single-use; open links stay reusable until they expire.
      if (invite.email) {
        await tx.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
      }
    });

    await logActivity({
      planId: invite.planId,
      userId: user.id,
      action: "member.joined",
      meta: { name: user.name },
    });
    publishToPlan(invite.planId, "member.changed", { userId: user.id });

    return redirect(`/p/${invite.plan.slug}/board`, 303);
  });
