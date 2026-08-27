import type { Children } from "@kitajs/html";
import type { ItemType, Priority } from "@prisma/client";
import { type DueState, avatarTint, dueLabel, dueState, initials } from "~/lib/format";
import { ax } from "~/views/alpine";
import { Icon, type IconName } from "~/views/icons";

/**
 * Shared UI primitives.
 *
 * IMPORTANT: @kitajs/html does not escape text children. Every element that
 * renders user-supplied text carries the `safe` attribute.
 */

export interface UserLike {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

// ================================ Avatar ==================================

export function Avatar({
  user,
  size = "md",
}: {
  user: UserLike;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const cls = size === "md" ? "avatar" : `avatar avatar-${size}`;

  if (user.avatarUrl) {
    return (
      <span class={cls} title={user.name}>
        <img src={user.avatarUrl} alt="" loading="lazy" width="48" height="48" />
      </span>
    );
  }

  return (
    <span class={cls} data-tint={avatarTint(user.id)} title={user.name}>
      <span safe>{initials(user.name)}</span>
    </span>
  );
}

export function AvatarStack({ users, max = 4 }: { users: UserLike[]; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;

  return (
    <span class="avatar-stack">
      {shown.map((u) => (
        <Avatar user={u} size="sm" />
      ))}
      {extra > 0 ? <span class="avatar avatar-sm">+{extra}</span> : null}
    </span>
  );
}

// ============================== Work item marks ============================

const TYPE_LETTER: Record<ItemType, string> = {
  TASK: "T",
  STORY: "S",
  BUG: "B",
  EPIC: "E",
  CHORE: "C",
};

const TYPE_LABEL: Record<ItemType, string> = {
  TASK: "Task",
  STORY: "Story",
  BUG: "Bug",
  EPIC: "Epic",
  CHORE: "Chore",
};

/** Colour is backed by a letter and a title, so it never carries meaning alone. */
export function TypeMark({ type }: { type: ItemType }) {
  return (
    <span class="type-mark" data-type={type} title={TYPE_LABEL[type]} role="img" aria-label={TYPE_LABEL[type]}>
      {TYPE_LETTER[type]}
    </span>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: "No priority",
  LOW: "Low priority",
  MEDIUM: "Medium priority",
  HIGH: "High priority",
  URGENT: "Urgent",
};

export function PriorityMark({ priority }: { priority: Priority }) {
  if (priority === "NONE") return null;
  return (
    <span
      class="priority-mark"
      data-priority={priority}
      title={PRIORITY_LABEL[priority]}
      role="img"
      aria-label={PRIORITY_LABEL[priority]}
    >
      <i />
      <i />
      <i />
    </span>
  );
}

export function StoryPoints({ points }: { points: number | null }) {
  if (points === null) return null;
  return (
    <span class="points" title={`${points} story points`}>
      {points}
    </span>
  );
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span class="badge chip" data-color={color} safe>
      {name}
    </span>
  );
}

export function DueBadge({ due, completed }: { due: Date | null; completed?: boolean }) {
  const state = dueState(due, completed);
  if (!due || !state) return null;

  return (
    <span class="due" data-state={state}>
      <Icon name="calendar" size={11} />
      {dueLabel(due, state)}
    </span>
  );
}

export type { DueState };

// ============================== Empty state ================================

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: Children;
}) {
  return (
    <div class="empty">
      <div class="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <p class="empty-title" safe>
        {title}
      </p>
      <p class="empty-body" safe>
        {body}
      </p>
      {action ?? null}
    </div>
  );
}

// ================================= Modal ===================================

/**
 * Modal shell. The backdrop closes on click or Escape via Alpine; the panel
 * traps nothing itself because htmx swaps its contents in and out.
 */
export function Modal({
  title,
  children,
  footer,
  size,
}: {
  title: string;
  children?: Children;
  footer?: Children;
  size?: "lg";
}) {
  return (
    <div
      class="modal-backdrop"
      x-data="{}"
      role="presentation"
      {...ax({
        "x-on:click.self": "$dispatch('close-modal')",
        "x-on:keydown.escape.window": "$dispatch('close-modal')",
      })}
    >
      <div
        class={size === "lg" ? "modal modal-lg" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div class="modal-header">
          <h2 class="modal-title" safe>
            {title}
          </h2>
          <button
            type="button"
            class="btn btn-icon"
            x-on:click="$dispatch('close-modal')"
            aria-label="Close dialog"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
        {footer ?? null}
      </div>
    </div>
  );
}

// ================================= Toast ===================================

export type ToastVariant = "info" | "success" | "error" | "warning";

/**
 * Rendered into the out-of-band toast region. `app.js` removes it after a delay.
 */
export function Toast({ message, variant = "info" }: { message: string; variant?: ToastVariant }) {
  const icon: IconName =
    variant === "success" ? "check" : variant === "error" ? "alert" : variant === "warning" ? "alert" : "info";

  return (
    <div class="toast" data-variant={variant} role="status" aria-live="polite">
      <Icon name={icon} size={16} />
      <span class="grow" safe>
        {message}
      </span>
    </div>
  );
}

/** Wraps a toast for an htmx out-of-band swap into #toasts. */
export function ToastOOB({ message, variant = "info" }: { message: string; variant?: ToastVariant }) {
  return (
    <div id="toasts" class="toast-region" hx-swap-oob="beforeend">
      <Toast message={message} variant={variant} />
    </div>
  );
}
