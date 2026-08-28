import type { Children } from "@kitajs/html";
import type { Column, ItemType, Priority, Sprint } from "@prisma/client";
import type { ItemCard as ItemCardData } from "~/lib/plans";
import { formatDate, relativeTime, toDateInput } from "~/lib/format";
import { ax } from "~/views/alpine";
import {
  Avatar,
  DueBadge,
  LabelChip,
  PriorityMark,
  StoryPoints,
  TypeMark,
  type UserLike,
} from "~/views/components";
import { Icon } from "~/views/icons";

export const ITEM_TYPES: ItemType[] = ["TASK", "STORY", "BUG", "EPIC", "CHORE"];
export const PRIORITIES: Priority[] = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"];

const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: "No priority",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const TYPE_LABEL: Record<ItemType, string> = {
  TASK: "Task",
  STORY: "Story",
  BUG: "Bug",
  EPIC: "Epic",
  CHORE: "Chore",
};

/** Opens the item dialog into the shared #modal host. */
function openItemAttrs(slug: string, itemId: string) {
  return {
    "hx-get": `/p/${slug}/items/${itemId}`,
    "hx-target": "#modal",
    "hx-swap": "innerHTML",
  } as const;
}

// ============================== Board card =================================

export function ItemCard({ item, slug }: { item: ItemCardData; slug: string }) {
  const done = Boolean(item.completedAt);

  return (
    <article class="card-item" data-item-id={item.id} aria-label={`${item.key}: ${item.title}`}>
      {item.labels.length > 0 ? (
        <div class="card-labels">
          {item.labels.map(({ label }) => (
            <LabelChip name={label.name} color={label.color} />
          ))}
        </div>
      ) : null}

      <p class="card-item-title" safe>
        {item.title}
      </p>

      <div class="card-item-meta">
        <TypeMark type={item.type} />
        <span class="card-item-key" safe>
          {item.key}
        </span>
        <PriorityMark priority={item.priority} />

        {item._count.comments > 0 ? (
          <span class="row gap-1 text-xs text-tertiary" title={`${item._count.comments} comments`}>
            <Icon name="message" size={12} />
            {item._count.comments}
          </span>
        ) : null}

        <span class="card-item-spacer" />
        <DueBadge due={item.dueDate} completed={done} />
        <StoryPoints points={item.storyPoints} />
        {item.assignee ? <Avatar user={item.assignee} size="sm" /> : null}

        {/* Explicit edit button — dialog only opens on intentional click */}
        <button
          type="button"
          class="btn btn-icon card-edit-btn"
          aria-label={`Edit ${item.key}`}
          data-tooltip="Edit"
          {...openItemAttrs(slug, item.id)}
          hx-trigger="click"
        >
          <Icon name="edit" size={12} />
        </button>
      </div>
    </article>
  );
}

// ============================= Backlog row =================================

export function BacklogRow({
  item,
  slug,
  selectable = false,
}: {
  item: ItemCardData;
  slug: string;
  selectable?: boolean;
}) {
  const done = Boolean(item.completedAt);

  return (
    <div
      class={done ? "backlog-row item-done" : "backlog-row"}
      data-item-id={item.id}
      aria-label={`${item.key}: ${item.title}`}
    >
      {selectable && !done ? (
        <input
          type="checkbox"
          class="checkbox backlog-select-cb"
          aria-label={`Select ${item.key}`}
          value={item.id}
          {...ax({ "x-model": "selected", "x-on:click.stop": "void 0" })}
        />
      ) : null}
      <span class="drag-handle" aria-label="Reorder" title="Drag to reorder" tabindex="-1">
        <Icon name="grip" size={14} />
      </span>

      <TypeMark type={item.type} />
      <span class="item-row-key" safe>
        {item.key}
      </span>
      <span class="item-row-title truncate" safe>
        {item.title}
      </span>

      <div class="item-row-meta">
        {item.labels.slice(0, 2).map(({ label }) => (
          <LabelChip name={label.name} color={label.color} />
        ))}
        <PriorityMark priority={item.priority} />
        <DueBadge due={item.dueDate} completed={done} />
        <StoryPoints points={item.storyPoints} />
        {item.assignee ? <Avatar user={item.assignee} size="sm" /> : null}

        {/* Explicit edit button — dialog only opens on intentional click */}
        <button
          type="button"
          class="btn btn-icon row-edit-btn"
          aria-label={`Edit ${item.key}`}
          data-tooltip="Edit"
          {...openItemAttrs(slug, item.id)}
          hx-trigger="click"
        >
          <Icon name="edit" size={13} />
        </button>
      </div>
    </div>
  );
}

// ========================== Compact list row ===============================
// Used by the dashboard and search, where there is no drag handle.

export function ItemRow({
  item,
  slug,
  showPlan,
}: {
  item: ItemCardData;
  slug: string;
  showPlan?: { emoji: string; name: string };
}) {
  const done = Boolean(item.completedAt);

  return (
    <div
      class={done ? "item-row item-done" : "item-row"}
      role="button"
      tabindex="0"
      aria-label={`${item.key}: ${item.title}`}
      {...openItemAttrs(slug, item.id)}
      hx-trigger="click, keyup[key=='Enter']"
    >
      <TypeMark type={item.type} />
      <span class="item-row-key" safe>
        {item.key}
      </span>
      <span class="item-row-title truncate" safe>
        {item.title}
      </span>

      <div class="item-row-meta">
        {showPlan ? (
          <span class="badge" title="Plan">
            <span aria-hidden="true" safe>
              {showPlan.emoji}
            </span>
            <span safe>{showPlan.name}</span>
          </span>
        ) : null}
        <PriorityMark priority={item.priority} />
        <DueBadge due={item.dueDate} completed={done} />
        {item.assignee ? <Avatar user={item.assignee} size="sm" /> : null}
      </div>
    </div>
  );
}

// ============================ Item dialog ==================================

export interface ItemDetail extends ItemCardData {
  description: string | null;
  reporter: UserLike;
  sprint: { id: string; name: string } | null;
  column: { id: string; name: string } | null;
  comments: {
    id: string;
    body: string;
    createdAt: Date;
    user: UserLike;
  }[];
  checklist: { id: string; text: string; done: boolean }[];
}

interface ItemDialogProps {
  item: ItemDetail;
  slug: string;
  columns: Column[];
  sprints: Pick<Sprint, "id" | "name" | "state">[];
  members: UserLike[];
  labels: { id: string; name: string; color: string }[];
  canEdit: boolean;
  canComment: boolean;
}

/**
 * The item dialog is the keyboard-accessible route to everything the board's
 * drag-and-drop does: status, sprint, assignee and rank all have controls here.
 */
export function ItemDialog({
  item,
  slug,
  columns,
  sprints,
  members,
  labels,
  canEdit,
  canComment,
}: ItemDialogProps) {
  const base = `/p/${slug}/items/${item.id}`;
  const done = Boolean(item.completedAt);
  const selectedLabels = new Set(item.labels.map((l) => l.labelId));

  return (
    <div
      class="modal-backdrop"
      x-data="{}"
      role="presentation"
      {...{
        "x-on:click.self": "$dispatch('close-modal')",
        "x-on:keydown.escape.window": "$dispatch('close-modal')",
      }}
    >
      <div class="modal modal-lg" role="dialog" aria-modal="true" aria-label={`${item.key} ${item.title}`}>
        <div class="modal-header">
          <TypeMark type={item.type} />
          <span class="mono text-secondary" safe>
            {item.key}
          </span>
          <span class="grow" />
          {done ? <span class="badge badge-success">Done</span> : null}
          {canEdit ? (
            <button
              type="button"
              class="btn btn-icon"
              hx-post={`${base}/archive`}
              hx-confirm="Archive this item? It will disappear from the board and backlog."
              hx-target="#modal"
              hx-swap="innerHTML"
              aria-label="Archive item"
              data-tooltip="Archive"
            >
              <Icon name="archive" size={16} />
            </button>
          ) : null}
          <button
            type="button"
            class="btn btn-icon"
            x-on:click="$dispatch('close-modal')"
            aria-label="Close dialog"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div class="item-detail">
          <div class="item-detail-main">
            {/* Title: submits on blur or Enter so there is no separate save button. */}
            {canEdit ? (
              <input
                class="input-seamless item-detail-title"
                name="title"
                value={item.title}
                aria-label="Item title"
                hx-patch={base}
                hx-trigger="blur, keyup[key=='Enter']"
                hx-swap="none"
              />
            ) : (
              <h2 class="item-detail-title" safe>
                {item.title}
              </h2>
            )}

            <div class="field">
              <span class="label">Description</span>
              {canEdit ? (
                <textarea
                  class="textarea"
                  name="description"
                  placeholder="Add more detail..."
                  aria-label="Description"
                  hx-patch={base}
                  hx-trigger="blur changed"
                  hx-swap="none"
                  safe
                >
                  {item.description ?? ""}
                </textarea>
              ) : (
                <p class="prose" data-placeholder="No description." safe>
                  {item.description ?? ""}
                </p>
              )}
            </div>

            <Checklist itemId={item.id} slug={slug} items={item.checklist} canEdit={canEdit} />

            <div>
              <h3 class="section-title">
                Comments{item.comments.length > 0 ? ` (${item.comments.length})` : ""}
              </h3>
              <div id={`comments-${item.id}`}>
                <CommentList comments={item.comments} />
              </div>

              {canComment ? (
                <form
                  class="row gap-2"
                  style="margin-top: var(--space-3); align-items: flex-start"
                  hx-post={`${base}/comments`}
                  hx-target={`#comments-${item.id}`}
                  hx-swap="innerHTML"
                  {...{ "hx-on::after-request": "if(event.detail.successful) this.reset()" }}
                >
                  <textarea
                    class="textarea"
                    name="body"
                    rows="2"
                    required
                    placeholder="Write a comment..."
                    aria-label="Write a comment"
                    style="min-height:44px"
                  />
                  <button type="submit" class="btn btn-primary">
                    Send
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <aside class="item-detail-side" aria-label="Item fields">
            <SideSelect
              label="Status"
              name="columnId"
              base={base}
              disabled={!canEdit}
              options={columns.map((c) => ({ value: c.id, label: c.name }))}
              value={item.column?.id ?? ""}
            />

            <SideSelect
              label="Assignee"
              name="assigneeId"
              base={base}
              disabled={!canEdit}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.id, label: m.name })),
              ]}
              value={item.assignee?.id ?? ""}
            />

            <SideSelect
              label="Type"
              name="type"
              base={base}
              disabled={!canEdit}
              options={ITEM_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
              value={item.type}
            />

            <SideSelect
              label="Priority"
              name="priority"
              base={base}
              disabled={!canEdit}
              options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              value={item.priority}
            />

            <SideSelect
              label="Sprint"
              name="sprintId"
              base={base}
              disabled={!canEdit}
              options={[
                { value: "", label: "Backlog" },
                ...sprints.map((s) => ({
                  value: s.id,
                  label: s.state === "ACTIVE" ? `${s.name} (active)` : s.name,
                })),
              ]}
              value={item.sprint?.id ?? ""}
            />

            <div class="side-field">
              <label class="side-label" for={`points-${item.id}`}>
                Story points
              </label>
              <input
                id={`points-${item.id}`}
                class="input"
                type="number"
                name="storyPoints"
                min="0"
                max="100"
                value={item.storyPoints?.toString() ?? ""}
                disabled={!canEdit}
                hx-patch={base}
                hx-trigger="change"
                hx-swap="none"
              />
            </div>

            <div class="side-field">
              <label class="side-label" for={`due-${item.id}`}>
                Due date
              </label>
              <input
                id={`due-${item.id}`}
                class="input"
                type="date"
                name="dueDate"
                value={toDateInput(item.dueDate)}
                disabled={!canEdit}
                hx-patch={base}
                hx-trigger="change"
                hx-swap="none"
              />
            </div>

            <div class="side-field">
              <span class="side-label">Labels</span>
              <div class="row gap-1" style="flex-wrap:wrap">
                {labels.map((label) => (
                  <button
                    type="button"
                    class="badge chip"
                    data-color={selectedLabels.has(label.id) ? label.color : "gray"}
                    style={selectedLabels.has(label.id) ? "" : "opacity:.45"}
                    aria-pressed={selectedLabels.has(label.id) ? "true" : "false"}
                    disabled={!canEdit}
                    hx-post={`${base}/labels/${label.id}`}
                    hx-target="#modal"
                    hx-swap="innerHTML"
                    safe
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            </div>

            <div class="side-field">
              <span class="side-label">Reporter</span>
              <span class="row gap-2">
                <Avatar user={item.reporter} size="sm" />
                <span class="text-sm truncate" safe>
                  {item.reporter.name}
                </span>
              </span>
            </div>

            <p class="text-xs text-tertiary">
              Created {formatDate(item.createdAt)}
              <br />
              Updated {relativeTime(item.updatedAt)}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SideSelect({
  label,
  name,
  base,
  options,
  value,
  disabled,
}: {
  label: string;
  name: string;
  base: string;
  options: { value: string; label: string }[];
  value: string;
  disabled?: boolean;
}) {
  const id = `${name}-${base.replace(/\W/g, "")}`;
  return (
    <div class="side-field">
      <label class="side-label" for={id}>
        {label}
      </label>
      <select
        id={id}
        class="select"
        name={name}
        disabled={disabled}
        hx-patch={base}
        hx-trigger="change"
        hx-swap="none"
      >
        {options.map((option) => (
          <option value={option.value} selected={option.value === value} safe>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CommentList({ comments }: { comments: ItemDetail["comments"] }) {
  if (comments.length === 0) {
    return <p class="text-sm text-tertiary">No comments yet.</p>;
  }

  return (
    <>
      {comments.map((comment) => (
        <div class="comment">
          <Avatar user={comment.user} />
          <div class="comment-body">
            <div class="comment-head">
              <span class="comment-author" safe>
                {comment.user.name}
              </span>
              <span class="text-xs text-tertiary">{relativeTime(comment.createdAt)}</span>
            </div>
            <p class="comment-text" safe>
              {comment.body}
            </p>
          </div>
        </div>
      ))}
    </>
  );
}

export function Checklist({
  itemId,
  slug,
  items,
  canEdit,
}: {
  itemId: string;
  slug: string;
  items: { id: string; text: string; done: boolean }[];
  canEdit: boolean;
}) {
  const base = `/p/${slug}/items/${itemId}/checklist`;
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div id={`checklist-${itemId}`}>
      <h3 class="section-title">
        Checklist{items.length > 0 ? ` (${doneCount}/${items.length})` : ""}
      </h3>

      {items.length > 0 ? (
        <>
          <div class="progress" style="margin-bottom: var(--space-3)">
            <div
              class="progress-bar"
              data-variant={doneCount === items.length ? "success" : undefined}
              style={`width:${items.length ? (doneCount / items.length) * 100 : 0}%`}
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin="0"
              aria-valuemax={items.length}
              aria-label="Checklist progress"
            />
          </div>

          <div class="checklist">
            {items.map((entry) => (
              <div class="checklist-row" data-done={entry.done ? "true" : "false"}>
                <input
                  type="checkbox"
                  class="checkbox"
                  checked={entry.done}
                  disabled={!canEdit}
                  aria-label={entry.text}
                  hx-post={`${base}/${entry.id}/toggle`}
                  hx-target={`#checklist-${itemId}`}
                  hx-swap="outerHTML"
                />
                <span class="checklist-text" safe>
                  {entry.text}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    class="btn btn-icon"
                    aria-label={`Delete "${entry.text}"`}
                    hx-delete={`${base}/${entry.id}`}
                    hx-target={`#checklist-${itemId}`}
                    hx-swap="outerHTML"
                  >
                    <Icon name="x" size={13} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {canEdit ? (
        <form
          class="row gap-2"
          style="margin-top: var(--space-2)"
          hx-post={base}
          hx-target={`#checklist-${itemId}`}
          hx-swap="outerHTML"
          {...{ "hx-on::after-request": "if(event.detail.successful) this.reset()" }}
        >
          <input
            class="input"
            name="text"
            required
            maxlength="200"
            placeholder="Add a checklist item"
            aria-label="Add a checklist item"
          />
          <button type="submit" class="btn btn-secondary">
            Add
          </button>
        </form>
      ) : null}
    </div>
  );
}

/** Wrapper so routes can return "close the dialog" without extra plumbing. */
export function CloseModal({ children }: { children?: Children }) {
  return <>{children ?? ""}</>;
}
