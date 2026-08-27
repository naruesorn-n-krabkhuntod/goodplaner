import type { Plan, Sprint } from "@prisma/client";
import { formatDate, pluralise } from "~/lib/format";
import type { ItemCard as ItemCardData } from "~/lib/plans";
import { ax } from "~/views/alpine";
import { EmptyState } from "~/views/components";
import { Icon } from "~/views/icons";
import { BacklogRow } from "~/views/item";

export interface BacklogGroupData {
  sprint: Sprint | null;
  items: ItemCardData[];
}

interface BacklogProps {
  plan: Plan;
  groups: BacklogGroupData[];
  canEdit: boolean;
  canManageSprints: boolean;
}

function totalPoints(items: ItemCardData[]): number {
  return items.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
}

/**
 * Backlog: one ranked list split into sprints plus the unassigned tail.
 * Dragging a row between groups is what assigns it to a sprint.
 */
export function BacklogRegion({ plan, groups, canEdit, canManageSprints }: BacklogProps) {
  const slug = plan.slug;
  const backlogGroup = groups.find((g) => g.sprint === null);
  const sprintGroups = groups.filter((g) => g.sprint !== null);

  return (
    <div
      class="backlog"
      id="backlog"
      data-backlog
      data-live-region
      data-move-url={`/p/${slug}/backlog/move`}
      hx-get={`/p/${slug}/backlog/fragment`}
      hx-trigger="gp:refresh"
      hx-swap="outerHTML"
    >
      {sprintGroups.map(({ sprint, items }) => (
        <BacklogGroup
          slug={slug}
          sprint={sprint}
          items={items}
          canEdit={canEdit}
          canManageSprints={canManageSprints}
        />
      ))}

      <BacklogGroup
        slug={slug}
        sprint={null}
        items={backlogGroup?.items ?? []}
        canEdit={canEdit}
        canManageSprints={canManageSprints}
      />
    </div>
  );
}

function BacklogGroup({
  slug,
  sprint,
  items,
  canEdit,
  canManageSprints,
}: {
  slug: string;
  sprint: Sprint | null;
  items: ItemCardData[];
  canEdit: boolean;
  canManageSprints: boolean;
}) {
  const points = totalPoints(items);
  const title = sprint ? sprint.name : "Backlog";
  const groupId = sprint ? `sprint-${sprint.id}` : "backlog-unassigned";

  return (
    <section class="backlog-group" aria-labelledby={`${groupId}-title`}>
      <header class="backlog-group-head">
        {sprint ? (
          <Icon name="sprint" size={15} />
        ) : (
          <Icon name="backlog" size={15} />
        )}

        <div>
          <h2 class="backlog-group-title" id={`${groupId}-title`} safe>
            {title}
          </h2>
          {sprint?.startDate && sprint.endDate ? (
            <p class="text-xs text-tertiary">
              {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
            </p>
          ) : null}
        </div>

        {sprint?.state === "ACTIVE" ? <span class="badge badge-accent">Active</span> : null}

        <div class="backlog-group-meta">
          <span class="text-sm text-secondary">{pluralise(items.length, "item")}</span>
          {points > 0 ? (
            <span class="points" title={`${points} story points in total`}>
              {points}
            </span>
          ) : null}

          {sprint && canManageSprints ? (
            sprint.state === "PLANNED" ? (
              <button
                type="button"
                class="btn btn-primary btn-sm"
                hx-post={`/p/${slug}/sprints/${sprint.id}/start`}
                hx-target="#backlog"
                hx-swap="outerHTML"
                disabled={items.length === 0}
                title={items.length === 0 ? "Add items before starting" : "Start this sprint"}
              >
                Start sprint
              </button>
            ) : (
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                hx-post={`/p/${slug}/sprints/${sprint.id}/complete`}
                hx-target="#backlog"
                hx-swap="outerHTML"
                hx-confirm="Complete this sprint? Unfinished items move back to the backlog."
              >
                Complete sprint
              </button>
            )
          ) : null}
        </div>
      </header>

      <div class="backlog-rows" data-sprint-id={sprint?.id ?? ""}>
        {items.map((item) => (
          <BacklogRow item={item} slug={slug} />
        ))}
      </div>

      {items.length === 0 ? (
        <p class="backlog-empty">
          {sprint
            ? "Drag items here to plan this sprint."
            : "Nothing in the backlog. Add an item below."}
        </p>
      ) : null}

      {!sprint && canEdit ? (
        <div style="padding: var(--space-3) var(--space-4)">
          <BacklogComposer slug={slug} />
        </div>
      ) : null}
    </section>
  );
}

function BacklogComposer({ slug }: { slug: string }) {
  return (
    <div x-data="{ open: false }">
      <button
        type="button"
        class="column-add"
        x-show="!open"
        x-on:click="open = true; $nextTick(() => $refs.title.focus())"
        data-shortcut-create="true"
      >
        <Icon name="plus" size={15} />
        Add item to backlog
      </button>

      <form
        x-show="open"
        x-cloak=""
        class="row gap-2"
        hx-post={`/p/${slug}/backlog/items`}
        hx-target="#backlog"
        hx-swap="outerHTML"
        {...ax({
          "x-on:keydown.escape": "open = false",
          "hx-on::after-request": "if(event.detail.successful) this.reset()",
        })}
      >
        <input
          class="input"
          name="title"
          required
          maxlength="200"
          placeholder="What needs doing?"
          aria-label="New backlog item"
          x-ref="title"
        />
        <button type="submit" class="btn btn-primary">
          Add
        </button>
        <button type="button" class="btn btn-ghost" x-on:click="open = false">
          Cancel
        </button>
      </form>
    </div>
  );
}

export function BacklogEmpty() {
  return (
    <EmptyState
      icon="backlog"
      title="Nothing planned yet"
      body="Add items to the backlog, then drag them into a sprint when you are ready to commit."
    />
  );
}
