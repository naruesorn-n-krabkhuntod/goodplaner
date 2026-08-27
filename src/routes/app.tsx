import { Elysia, t } from "elysia";
import { db } from "~/lib/db";
import { PLAN_COLORS, PLAN_EMOJI, pluralise, relativeTime } from "~/lib/format";
import { createPlan, itemCardInclude } from "~/lib/plans";
import { authed } from "~/plugins/session";
import { AvatarStack, EmptyState } from "~/views/components";
import { Icon } from "~/views/icons";
import { ItemRow } from "~/views/item";
import { AppShell, Topbar } from "~/views/layout";

/**
 * Cross-plan views: the home dashboard, the plan index, plan creation and search.
 * These are the only pages that reach across every plan the user belongs to.
 */

const DAY_MS = 86_400_000;

export const appRoutes = new Elysia()
  .use(authed)

  // ------------------------------------------------------------------- home
  .get("/app", async ({ currentUser, sidebarPlans }) => {
    const planIds = sidebarPlans.map((p) => p.id);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const inAWeek = new Date(endOfToday.getTime() + 7 * DAY_MS);

    const planById = new Map(sidebarPlans.map((p) => [p.id, p]));

    const [assigned, overdue, dueSoon, recentPlans] = await Promise.all([
      db.item.findMany({
        where: {
          planId: { in: planIds },
          assigneeId: currentUser.id,
          archivedAt: null,
          completedAt: null,
        },
        include: itemCardInclude,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { rank: "asc" }],
        take: 25,
      }),
      db.item.count({
        where: {
          planId: { in: planIds },
          assigneeId: currentUser.id,
          archivedAt: null,
          completedAt: null,
          dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      db.item.count({
        where: {
          planId: { in: planIds },
          assigneeId: currentUser.id,
          archivedAt: null,
          completedAt: null,
          dueDate: { gte: new Date(), lte: inAWeek },
        },
      }),
      db.plan.findMany({
        where: { id: { in: planIds } },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: { id: true, slug: true, name: true, emoji: true },
      }),
    ]);

    const completedThisWeek = await db.item.count({
      where: {
        planId: { in: planIds },
        assigneeId: currentUser.id,
        completedAt: { gte: new Date(Date.now() - 7 * DAY_MS) },
      },
    });

    const firstName = currentUser.name.split(" ")[0] ?? currentUser.name;

    return (
      <AppShell
        title="Home - GoodPlanner"
        user={currentUser}
        plans={sidebarPlans}
        activeNav="home"
      >
        <Topbar crumbs={[{ label: "Home" }]} />

        <div class="page">
          <div class="page-inner">
            <header class="page-header">
              <div class="grow">
                <h1 class="page-title">
                  Hello, <span safe>{firstName}</span>
                </h1>
                <p class="page-subtitle">
                  {assigned.length === 0
                    ? "Nothing is assigned to you right now."
                    : `${pluralise(assigned.length, "open item")} across ${pluralise(sidebarPlans.length, "plan")}.`}
                </p>
              </div>
            </header>

            <div class="stat-grid">
              <div class="stat" data-tone={overdue > 0 ? "danger" : undefined}>
                <div class="stat-value">{overdue}</div>
                <div class="stat-label">Overdue</div>
              </div>
              <div class="stat" data-tone={dueSoon > 0 ? "warning" : undefined}>
                <div class="stat-value">{dueSoon}</div>
                <div class="stat-label">Due this week</div>
              </div>
              <div class="stat">
                <div class="stat-value">{assigned.length}</div>
                <div class="stat-label">Assigned to me</div>
              </div>
              <div class="stat" data-tone={completedThisWeek > 0 ? "success" : undefined}>
                <div class="stat-value">{completedThisWeek}</div>
                <div class="stat-label">Done this week</div>
              </div>
            </div>

            <section style="margin-bottom: var(--space-6)">
              <h2 class="section-title">My work</h2>
              {assigned.length === 0 ? (
                <EmptyState
                  icon="check"
                  title="Your queue is empty"
                  body="Items assigned to you across every plan land here, soonest due date first."
                  action={
                    sidebarPlans.length === 0 ? (
                      <a class="btn btn-primary" href="/app/plans/new">
                        <Icon name="plus" size={15} />
                        Create your first plan
                      </a>
                    ) : null
                  }
                />
              ) : (
                <div class="item-list">
                  {assigned.map((item) => {
                    const plan = planById.get(item.planId);
                    return (
                      <ItemRow
                        item={item}
                        slug={plan?.slug ?? ""}
                        showPlan={plan ? { emoji: plan.emoji, name: plan.name } : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </section>

            {recentPlans.length > 0 ? (
              <section>
                <h2 class="section-title">Jump back in</h2>
                <div class="plan-grid">
                  {recentPlans.map((plan) => (
                    <a class="plan-card" href={`/p/${plan.slug}/board`}>
                      <span class="plan-card-emoji" aria-hidden="true" safe>
                        {plan.emoji}
                      </span>
                      <span class="plan-card-name truncate" safe>
                        {plan.name}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div id="modal" />
      </AppShell>
    );
  })

  // ------------------------------------------------------------ plan index
  .get("/app/plans", async ({ currentUser, sidebarPlans }) => {
    const plans = await db.plan.findMany({
      where: { archivedAt: null, members: { some: { userId: currentUser.id } } },
      orderBy: { updatedAt: "desc" },
      include: {
        members: {
          take: 5,
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        _count: { select: { items: true, members: true } },
      },
    });

    return (
      <AppShell
        title="Plans - GoodPlanner"
        user={currentUser}
        plans={sidebarPlans}
        activeNav="plans"
      >
        <Topbar
          crumbs={[{ label: "All plans" }]}
          actions={
            <a class="btn btn-primary btn-sm" href="/app/plans/new">
              <Icon name="plus" size={14} />
              New plan
            </a>
          }
        />

        <div class="page">
          <div class="page-inner page-wide">
            {plans.length === 0 ? (
              <EmptyState
                icon="archive"
                title="No plans yet"
                body="A plan is a workspace with its own board, backlog, sprints and whiteboards. Keep one for work and another for life."
                action={
                  <a class="btn btn-primary" href="/app/plans/new">
                    <Icon name="plus" size={15} />
                    Create a plan
                  </a>
                }
              />
            ) : (
              <div class="plan-grid">
                {plans.map((plan) => (
                  <a class="plan-card" href={`/p/${plan.slug}/board`}>
                    <span class="plan-card-emoji" aria-hidden="true" safe>
                      {plan.emoji}
                    </span>
                    <span class="plan-card-name" safe>
                      {plan.name}
                    </span>
                    {plan.description ? (
                      <span class="plan-card-desc clamp-2" safe>
                        {plan.description}
                      </span>
                    ) : null}
                    <span class="plan-card-foot">
                      <AvatarStack users={plan.members.map((m) => m.user)} />
                      <span>{pluralise(plan._count.items, "item")}</span>
                      <span style="margin-left:auto">{relativeTime(plan.updatedAt)}</span>
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppShell>
    );
  })

  // ----------------------------------------------------------- create plan
  .get("/app/plans/new", ({ currentUser, sidebarPlans }) => (
    <AppShell
      title="New plan - GoodPlanner"
      user={currentUser}
      plans={sidebarPlans}
      activeNav="plans"
    >
      <Topbar crumbs={[{ label: "All plans", href: "/app/plans" }, { label: "New plan" }]} />

      <div class="page">
        <div class="page-inner" style="max-width:560px">
          <header class="page-header">
            <div>
              <h1 class="page-title">Create a plan</h1>
              <p class="page-subtitle">
                Each plan is its own workspace with a board, backlog, sprints and whiteboards.
              </p>
            </div>
          </header>

          <form method="post" action="/app/plans" class="stack gap-5" x-data="{ emoji: '\u{1F4CB}' }">
            <div class="field">
              <label class="label" for="plan-name">
                Name <span class="required">*</span>
              </label>
              <input
                id="plan-name"
                class="input"
                name="name"
                required
                maxlength="60"
                autofocus
                placeholder="Product team, Home, Marketing site..."
              />
              <p class="field-hint">You can rename this later.</p>
            </div>

            <div class="field">
              <label class="label" for="plan-description">
                Description
              </label>
              <textarea
                id="plan-description"
                class="textarea"
                name="description"
                maxlength="280"
                placeholder="What is this plan for?"
              />
            </div>

            <fieldset class="field">
              <legend class="label">Icon</legend>
              <input type="hidden" name="emoji" x-bind:value="emoji" />
              <div class="row gap-1" style="flex-wrap:wrap">
                {PLAN_EMOJI.map((emoji) => (
                  <button
                    type="button"
                    class="btn btn-icon"
                    style="font-size:18px; width:36px; height:36px"
                    x-on:click={`emoji = '${emoji}'`}
                    x-bind:aria-pressed={`emoji === '${emoji}'`}
                    x-bind:style={`emoji === '${emoji}' ? 'background: var(--wash-selected); font-size:18px; width:36px; height:36px' : 'font-size:18px; width:36px; height:36px'`}
                    aria-label={`Use icon ${emoji}`}
                    safe
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset class="field">
              <legend class="label">Accent colour</legend>
              <div class="row gap-2" style="flex-wrap:wrap">
                {PLAN_COLORS.map((color, index) => (
                  <label class="row gap-1" style="cursor:pointer">
                    <input
                      type="radio"
                      name="color"
                      value={color}
                      checked={index === 0}
                      class="sr-only"
                    />
                    <span
                      class="badge chip"
                      data-color={color}
                      style="text-transform:capitalize; height:26px"
                    >
                      {color}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div class="row gap-2">
              <button type="submit" class="btn btn-primary btn-lg">
                Create plan
              </button>
              <a class="btn btn-ghost btn-lg" href="/app/plans">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  ))

  .post(
    "/app/plans",
    async ({ currentUser, body, redirect }) => {
      const plan = await createPlan(currentUser.id, {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        emoji: body.emoji || undefined,
        color: body.color || undefined,
      });

      return redirect(`/p/${plan.slug}/board`, 303);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 60 }),
        description: t.Optional(t.String({ maxLength: 280 })),
        emoji: t.Optional(t.String({ maxLength: 8 })),
        color: t.Optional(t.String({ maxLength: 16 })),
      }),
    },
  )

  // ---------------------------------------------------------------- search
  .get(
    "/app/search",
    async ({ currentUser, query }) => {
      const term = query.q?.trim() ?? "";

      if (term.length < 2) {
        return (
          <p class="text-sm text-tertiary" style="padding: var(--space-3)">
            Type at least two characters.
          </p>
        );
      }

      const items = await db.item.findMany({
        where: {
          archivedAt: null,
          plan: { members: { some: { userId: currentUser.id } } },
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { key: { contains: term, mode: "insensitive" } },
          ],
        },
        include: { ...itemCardInclude, plan: { select: { slug: true, name: true, emoji: true } } },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });

      if (items.length === 0) {
        return (
          <p class="text-sm text-tertiary" style="padding: var(--space-3)">
            No items match "<span safe>{term}</span>".
          </p>
        );
      }

      return (
        <div class="item-list">
          {items.map((item) => (
            <ItemRow
              item={item}
              slug={item.plan.slug}
              showPlan={{ emoji: item.plan.emoji, name: item.plan.name }}
            />
          ))}
        </div>
      );
    },
    { query: t.Object({ q: t.Optional(t.String({ maxLength: 100 })) }) },
  );
