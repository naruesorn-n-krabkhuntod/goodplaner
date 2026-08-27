import type { Plan, Whiteboard } from "@prisma/client";
import { relativeTime } from "~/lib/format";
import { ax } from "~/views/alpine";
import { Avatar, EmptyState, type UserLike } from "~/views/components";
import { Icon, type IconName } from "~/views/icons";

/** Ink colours. Sticky notes reuse these as their paper colour. */
const PALETTE = [
  { value: "#2383e2", label: "Blue" },
  { value: "#8a63d2", label: "Purple" },
  { value: "#4a8a5c", label: "Green" },
  { value: "#cb7b37", label: "Orange" },
  { value: "#c4554d", label: "Red" },
  { value: "#f3d34a", label: "Yellow" },
  { value: "#6b6b68", label: "Grey" },
];

const TOOLS: { tool: string; icon: IconName; label: string; key: string }[] = [
  { tool: "select", icon: "pointer", label: "Select", key: "V" },
  { tool: "pen", icon: "pen", label: "Pen", key: "P" },
  { tool: "rect", icon: "square", label: "Rectangle", key: "R" },
  { tool: "ellipse", icon: "circle", label: "Ellipse", key: "O" },
  { tool: "arrow", icon: "arrowTool", label: "Arrow", key: "A" },
  { tool: "note", icon: "sticky", label: "Sticky note", key: "N" },
  { tool: "text", icon: "text", label: "Text", key: "T" },
  { tool: "eraser", icon: "eraser", label: "Eraser", key: "E" },
  { tool: "pan", icon: "hand", label: "Pan", key: "H" },
];

export interface WhiteboardTile extends Pick<Whiteboard, "id" | "name" | "updatedAt"> {
  createdBy: UserLike;
}

// ============================== Index page =================================

export function WhiteboardGrid({
  plan,
  boards,
  canEdit,
}: {
  plan: Plan;
  boards: WhiteboardTile[];
  canEdit: boolean;
}) {
  if (boards.length === 0) {
    return (
      <EmptyState
        icon="whiteboard"
        title="No whiteboards yet"
        body="An infinite canvas for sketching architecture, mapping a flow, or running a retro."
        action={
          canEdit ? (
            <form hx-post={`/p/${plan.slug}/whiteboards`} hx-swap="none">
              <button type="submit" class="btn btn-primary">
                <Icon name="plus" size={15} />
                New whiteboard
              </button>
            </form>
          ) : null
        }
      />
    );
  }

  return (
    <div class="wb-grid">
      {boards.map((board) => (
        <a class="wb-tile" href={`/p/${plan.slug}/whiteboards/${board.id}`}>
          <div class="wb-tile-preview">
            <Icon name="whiteboard" size={26} />
          </div>
          <div class="wb-tile-foot">
            <p class="font-medium truncate" safe>
              {board.name}
            </p>
            <p class="row gap-2 text-xs text-tertiary" style="margin-top:4px">
              <Avatar user={board.createdBy} size="sm" />
              <span>Edited {relativeTime(board.updatedAt)}</span>
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

// ============================== Canvas page ================================

export function WhiteboardCanvas({
  plan,
  board,
  canEdit,
}: {
  plan: Plan;
  board: Whiteboard;
  canEdit: boolean;
}) {
  return (
    <div
      class="wb"
      data-whiteboard
      data-board-id={board.id}
      data-readonly={canEdit ? "false" : "true"}
      data-save-url={`/p/${plan.slug}/whiteboards/${board.id}/scene`}
      data-scene={JSON.stringify(board.scene ?? [])}
    >
      <canvas aria-label={`Whiteboard: ${board.name}`} role="img" />

      {canEdit ? (
        <div class="wb-toolbar" role="toolbar" aria-label="Whiteboard tools">
          {TOOLS.map((entry) => (
            <button
              type="button"
              class="wb-tool"
              data-tool={entry.tool}
              aria-pressed={entry.tool === "select" ? "true" : "false"}
              aria-label={`${entry.label} (${entry.key})`}
              data-tooltip={`${entry.label} - ${entry.key}`}
            >
              <Icon name={entry.icon} size={17} />
            </button>
          ))}

          <span class="wb-sep" aria-hidden="true" />

          {PALETTE.map((swatch, index) => (
            <button
              type="button"
              class="wb-swatch"
              data-color={swatch.value}
              style={`background:${swatch.value}`}
              aria-pressed={index === 0 ? "true" : "false"}
              aria-label={swatch.label}
              data-tooltip={swatch.label}
            />
          ))}

          <span class="wb-sep" aria-hidden="true" />

          <button
            type="button"
            class="wb-tool"
            data-action="undo"
            aria-label="Undo"
            data-tooltip="Undo - Ctrl+Z"
          >
            <Icon name="undo" size={17} />
          </button>
          <button
            type="button"
            class="wb-tool"
            data-action="redo"
            aria-label="Redo"
            data-tooltip="Redo - Ctrl+Shift+Z"
          >
            <Icon name="redo" size={17} />
          </button>
          <button
            type="button"
            class="wb-tool"
            data-action="clear"
            aria-label="Clear board"
            data-tooltip="Clear board"
          >
            <Icon name="trash" size={17} />
          </button>
        </div>
      ) : null}

      <div class="wb-status">
        <button type="button" class="btn btn-icon" data-action="zoom-out" aria-label="Zoom out">
          <Icon name="zoomOut" size={15} />
        </button>
        <button
          type="button"
          class="wb-zoom-value"
          data-zoom-value
          data-action="zoom-reset"
          title="Reset zoom"
        >
          100%
        </button>
        <button type="button" class="btn btn-icon" data-action="zoom-in" aria-label="Zoom in">
          <Icon name="zoomIn" size={15} />
        </button>
      </div>

      {canEdit ? (
        <div class="wb-save-state" data-save-state data-state="saved" role="status" aria-live="polite">
          <Icon name="check" size={13} />
          <span data-save-text>Saved</span>
        </div>
      ) : (
        <div class="wb-save-state" role="status">
          <Icon name="info" size={13} />
          <span>View only</span>
        </div>
      )}
    </div>
  );
}

/** Rename control shown in the topbar of a single whiteboard. */
export function WhiteboardTitle({
  slug,
  board,
  canEdit,
}: {
  slug: string;
  board: Whiteboard;
  canEdit: boolean;
}) {
  if (!canEdit) {
    return (
      <span class="font-medium truncate" safe>
        {board.name}
      </span>
    );
  }

  return (
    <input
      class="input-seamless font-medium"
      style="max-width:280px"
      name="name"
      value={board.name}
      maxlength="80"
      aria-label="Whiteboard name"
      hx-patch={`/p/${slug}/whiteboards/${board.id}`}
      hx-trigger="blur changed, keyup[key=='Enter']"
      hx-swap="none"
    />
  );
}

/** Delete button with a confirm step, used in the whiteboard topbar. */
export function WhiteboardActions({ slug, boardId }: { slug: string; boardId: string }) {
  return (
    <div class="dropdown" x-data="{ open: false }" {...ax({ "x-on:click.outside": "open = false" })}>
      <button
        type="button"
        class="btn btn-icon"
        x-on:click="open = !open"
        aria-label="Whiteboard actions"
      >
        <Icon name="more" size={16} />
      </button>
      <div class="menu dropdown-panel" data-align="right" x-show="open" x-cloak="" role="menu">
        <button
          type="button"
          class="menu-item menu-item-danger"
          role="menuitem"
          hx-delete={`/p/${slug}/whiteboards/${boardId}`}
          hx-confirm="Delete this whiteboard? This cannot be undone."
          hx-swap="none"
        >
          <Icon name="trash" size={15} />
          Delete whiteboard
        </button>
      </div>
    </div>
  );
}
