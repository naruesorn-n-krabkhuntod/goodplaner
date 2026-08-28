import type { Column, Plan, Sprint, StatusCategory } from "@prisma/client";
import type { ItemCard as ItemCardData } from "~/lib/plans";
import { ax } from "~/views/alpine";
import { EmptyState, type UserLike } from "~/views/components";
import { Icon } from "~/views/icons";
import { ItemCard } from "~/views/item";

export interface BoardColumnData {
  column: Column;
  items: ItemCardData[];
}

interface BoardProps {
  plan: Plan;
  columns: BoardColumnData[];
  activeSprint: Sprint | null;
  canEdit: boolean;
  members: UserLike[];
}

/** The whole board region. Re-rendered on `gp:refresh` when a teammate changes something. */
export function BoardRegion({ plan, columns, activeSprint, canEdit, members }: BoardProps) {
  const slug = plan.slug;

  return (
    <div
      class="board"
      id="board"
      data-board
      data-live-region
      data-move-url={`/p/${slug}/board/move`}
      hx-get={`/p/${slug}/board/fragment`}
      hx-trigger="gp:refresh"
      hx-swap="outerHTML"
      aria-label={activeSprint ? `Board for ${activeSprint.name}` : "Board"}
    >
      {columns.map(({ column, items }) => (
        <section class="column" aria-labelledby={`col-title-${column.id}`}>
          <ColumnHeader column={column} count={items.length} />

          <div class="column-body" id={`col-body-${column.id}`} data-column-id={column.id}>
            {items.map((item) => (
              <ItemCard item={item} slug={slug} />
            ))}
          </div>

          {canEdit ? (
            <div class="column-foot">
              <ColumnComposer slug={slug} column={column} members={members} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/**
 * Rendered on its own so a card move can refresh just the two affected counts
 * via an out-of-band swap instead of redrawing the board.
 */
export function ColumnHeader({
  column,
  count,
  oob,
}: {
  column: Column;
  count: number;
  oob?: boolean;
}) {
  const overLimit = column.wipLimit !== null && count > column.wipLimit;

  return (
    <header class="column-head" id={`col-head-${column.id}`} hx-swap-oob={oob ? "true" : undefined}>
      <span class="column-dot" data-category={column.category} aria-hidden="true" />
      <h2 class="column-name truncate" id={`col-title-${column.id}`} safe>
        {column.name}
      </h2>
      <span
        class="column-count"
        data-over-limit={overLimit ? "true" : "false"}
        title={
          column.wipLimit === null
            ? `${count} items`
            : overLimit
              ? `${count} items - over the WIP limit of ${column.wipLimit}`
              : `${count} of a ${column.wipLimit} item WIP limit`
        }
      >
        {column.wipLimit === null ? `${count}` : `${count}/${column.wipLimit}`}
      </span>
      {overLimit ? (
        <span class="badge badge-danger" title="Work in progress limit exceeded">
          Over limit
        </span>
      ) : null}
    </header>
  );
}

/** Inline "add item" composer that stays open for rapid entry. */
function ColumnComposer({
  slug,
  column,
  members,
}: {
  slug: string;
  column: Column;
  members: UserLike[];
}) {
  return (
    <div x-data="{ open: false }">
      <button
        type="button"
        class="column-add"
        x-show="!open"
        x-on:click="open = true; $nextTick(() => $refs.title.focus())"
        data-shortcut-create={column.position === 0 ? "true" : undefined}
      >
        <Icon name="plus" size={15} />
        Add item
      </button>

      <form
        x-show="open"
        x-cloak=""
        class="stack gap-2"
        hx-post={`/p/${slug}/items`}
        hx-target={`#col-body-${column.id}`}
        hx-swap="beforeend"
        {...ax({
          "x-on:keydown.escape": "open = false",
          "hx-on::after-request":
            "if(event.detail.successful){ this.reset(); this.querySelector('textarea').focus(); }",
        })}
      >
        <input type="hidden" name="columnId" value={column.id} />
        <textarea
          class="textarea"
          name="title"
          rows="2"
          required
          maxlength="200"
          placeholder="What needs doing?"
          aria-label={`New item in ${column.name}`}
          x-ref="title"
          style="min-height:56px"
          {...ax({ "x-on:keydown.enter.prevent": "$el.form.requestSubmit()" })}
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

/** Shown when a plan has no columns at all, which only happens if they were deleted. */
export function BoardEmpty() {
  return (
    <EmptyState
      icon="board"
      title="This board has no columns"
      body="Add columns in the plan settings to start tracking work."
    />
  );
}

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
