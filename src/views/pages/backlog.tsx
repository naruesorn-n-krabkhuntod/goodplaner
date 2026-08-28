import type { Plan, Sprint } from "@prisma/client";
import { formatDate, pluralise } from "~/lib/format";
import type { ItemCard as ItemCardData } from "~/lib/plans";
import { ax } from "~/views/alpine";
import { EmptyState, type UserLike } from "~/views/components";
import { Icon } from "~/views/icons";
import { BacklogRow } from "~/views/item";
import { Children } from "@kitajs/html";

export interface BacklogGroupData {
  sprint: Sprint | null;
  items: ItemCardData[];
}

interface BacklogProps {
  plan: Plan;
  groups: BacklogGroupData[];
  canEdit: boolean;
  canManageSprints: boolean;
  members: UserLike[];
}

function totalPoints(items: ItemCardData[]): number {
  return items.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
}

/**
 * Backlog: one ranked list split into sprints plus the unassigned tail.
 * Dragging a row between groups assigns it to a sprint.
 * Checking the checkboxes in the backlog tail and pressing "New sprint" creates
 * a sprint with those items pre-loaded.
 */
export function BacklogRegion({ plan, groups, canEdit, canManageSprints, members }: BacklogProps) {
  const slug = plan.slug;
  const backlogGroup = groups.find((g) => g.sprint === null);
  const sprintGroups = groups.filter((g) => g.sprint !== null);
  const hasActive = sprintGroups.some((g) => g.sprint?.state === "ACTIVE");
  const nonCompletedSprints = sprintGroups
    .filter((g) => g.sprint && g.sprint.state !== "COMPLETED")
    .map((g) => g.sprint!);

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
      {...(canManageSprints ? { "x-data": "backlogSelect" } : {})}
    >
      {sprintGroups.map(({ sprint, items }) => (
        <BacklogGroup
          slug={slug}
          sprint={sprint}
          items={items}
          canEdit={canEdit}
          canManageSprints={canManageSprints}
          selectable={false}
        />
      ))}

      <BacklogGroup
        slug={slug}
        sprint={null}
        items={backlogGroup?.items ?? []}
        canEdit={canEdit}
        canManageSprints={canManageSprints}
        selectable={canManageSprints}
        members={members}
      />

      {/* Floating action bar — appears when items are selected */}
      {canManageSprints ? (
        <div
          class="backlog-select-bar"
          x-show="selected.length > 0"
          x-cloak=""
          x-transition=""
        >
          <span class="text-sm text-secondary" x-text="`${selected.length} item${selected.length === 1 ? '' : 's'} selected`" />

          {/* Add selected items to an existing sprint */}
          {nonCompletedSprints.map((sprint) => (
            <form
              hx-post={`/p/${slug}/sprints/${sprint.id}/add-items`}
              hx-target="#backlog"
              hx-swap="outerHTML"
              {...ax({ "x-on:submit": "appendSelectedIds($event)" })}
            >
              <button type="submit" class="btn btn-secondary btn-sm">
                <Icon name="sprint" size={14} />
                Add to <span safe>{sprint.name}</span>
              </button>
            </form>
          ))}

          {/* Create a brand-new sprint with the selected items */}
          <form
            hx-post={`/p/${slug}/sprints`}
            hx-target="#backlog"
            hx-swap="outerHTML"
            {...ax({ "x-on:submit": "appendSelectedIds($event)" })}
          >
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              disabled={hasActive}
              title={
                hasActive
                  ? "Complete the active sprint first"
                  : "Create a new sprint with selected items"
              }
            >
              <Icon name="plus" size={14} />
              New sprint
            </button>
          </form>

          <button
            type="button"
            class="btn btn-ghost btn-sm"
            {...ax({ "x-on:click": "selected = []" })}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BacklogGroup({
  slug,
  sprint,
  items,
  canEdit,
  canManageSprints,
  selectable,
  members = [],
}: {
  slug: string;
  sprint: Sprint | null;
  items: ItemCardData[];
  canEdit: boolean;
  canManageSprints: boolean;
  selectable: boolean;
  members?: UserLike[];
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
          <BacklogRow item={item} slug={slug} selectable={selectable} />
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
          <BacklogComposer slug={slug} members={members} />
        </div>
      ) : null}
    </section>
  );
}

function BacklogComposer({ slug, members }: { slug: string; members: UserLike[] }) {
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
        class="stack gap-2"
        hx-post={`/p/${slug}/backlog/items`}
        hx-target="#backlog"
        hx-swap="outerHTML"
        {...ax({
          "x-on:keydown.escape": "open = false",
          "hx-on::after-request": "if(event.detail.successful) open = false",
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
        {members.length > 0 ? (
          <select class="select" name="assigneeId" aria-label="Assignee">
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option value={m.id} safe>
                {m.name}
              </option>
            ))}
          </select>
        ) : null}
        <div class="row gap-2">
          <button type="submit" class="btn btn-primary btn-sm">
            Add
          </button>
          <button type="button" class="btn btn-ghost btn-sm" x-on:click="open = false">
            Cancel
          </button>
        </div>
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
