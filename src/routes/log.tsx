import type { Prisma } from "@prisma/client";
import { Elysia, t } from "elysia";
import { describeActivity } from "~/lib/activity";
import { db } from "~/lib/db";
import { dayLabel, formatTime } from "~/lib/format";
import { planScope } from "~/plugins/plan-scope";
import { Avatar, EmptyState } from "~/views/components";
import { Icon } from "~/views/icons";
import { PlanLayout } from "~/views/plan-layout";

const PAGE_SIZE = 60;

type LogEntry = Prisma.ActivityGetPayload<{
  include: {
    user: { select: { id: true; name: true; avatarUrl: true } };
    item: { select: { id: true; key: true; title: true } };
  };
}>;

function groupByDay(entries: LogEntry[]) {
  const days: { label: string; entries: LogEntry[] }[] = [];

  for (const entry of entries) {
    const label = dayLabel(entry.createdAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  return days;
}

function LogList({ slug, entries, nextCursor }: { slug: string; entries: LogEntry[]; nextCursor: string | null }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="log"
        title="Nothing has happened yet"
        body="Every change to this plan - items moved, sprints started, people joining - shows up here."
      />
    );
  }

  return (
    <>
      {groupByDay(entries).map((day) => (
        <section class="log-day">
          <h2 class="log-day-label" safe>
            {day.label}
          </h2>

          {day.entries.map((entry) => (
            <div class="log-entry">
              {entry.user ? (
                <Avatar user={entry.user} />
              ) : (
                <span class="avatar" title="System">
                  <Icon name="sparkle" size={12} />
                </span>
              )}

              <p class="log-entry-body">
                <span class="font-medium" safe>
                  {entry.user?.name ?? "Someone"}
                </span>{" "}
                <span safe>
                  {describeActivity(entry.action, (entry.meta ?? {}) as Record<string, unknown>)}
                </span>{" "}
                {entry.item ? (
                  <a
                    class="log-target"
                    href={`/p/${slug}/board`}
                    hx-get={`/p/${slug}/items/${entry.item.id}`}
                    hx-target="#modal"
                    hx-swap="innerHTML"
                    title={entry.item.title}
                  >
                    <span safe>{entry.item.key}</span>
                  </a>
                ) : null}
              </p>

              <time class="log-entry-time" datetime={entry.createdAt.toISOString()}>
                {formatTime(entry.createdAt)}
              </time>
            </div>
          ))}
        </section>
      ))}

      {nextCursor ? (
        <button
          type="button"
          class="btn btn-secondary btn-block"
          hx-get={`/p/${slug}/log/more?cursor=${nextCursor}`}
          hx-target="this"
          hx-swap="outerHTML"
        >
          Load older activity
        </button>
      ) : (
        <p class="text-sm text-tertiary" style="text-align:center; padding: var(--space-4)">
          That is the whole history.
        </p>
      )}
    </>
  );
}

async function loadPage(planId: string, cursor?: string) {
  const entries = await db.activity.findMany({
    where: { planId },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      item: { select: { id: true, key: true, title: true } },
    },
  });

  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;
  return { entries: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export const logRoutes = new Elysia({ prefix: "/p/:slug" })
  .use(planScope)

  .get("/log", async ({ access, currentUser, sidebarPlans }) => {
    const { plan } = access;
    const { entries, nextCursor } = await loadPage(plan.id);

    return (
      <PlanLayout user={currentUser} plans={sidebarPlans} plan={plan} tab="log">
        <div class="page-inner">
          <div class="log-list" id="log">
            <LogList slug={plan.slug} entries={entries} nextCursor={nextCursor} />
          </div>
        </div>
      </PlanLayout>
    );
  })

  /** Cursor pagination: replaces the "load older" button with the next page plus a new button. */
  .get(
    "/log/more",
    async ({ access, query }) => {
      const { entries, nextCursor } = await loadPage(access.plan.id, query.cursor);
      return <LogList slug={access.plan.slug} entries={entries} nextCursor={nextCursor} />;
    },
    { query: t.Object({ cursor: t.Optional(t.String()) }) },
  );
