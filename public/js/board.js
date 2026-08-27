/**
 * Drag-and-drop island for the board and the backlog.
 *
 * htmx renders and re-renders the lists; this file only adds pointer dragging
 * on top. Every move it performs is also reachable from the keyboard through
 * the Status select in the item dialog and the sprint select in the backlog,
 * so no functionality is locked behind a mouse.
 */

const sortables = new WeakMap();

function itemIds(container) {
  return [...container.querySelectorAll("[data-item-id]")].map((el) => el.dataset.itemId);
}

/** Sends the move and lets htmx apply the out-of-band fragments in the reply. */
function postMove(url, values, source) {
  window.htmx.ajax("POST", url, { source, swap: "none", values });
}

function flash(el) {
  if (!el) return;
  el.classList.add("just-updated");
  setTimeout(() => el.classList.remove("just-updated"), 900);
}

// ------------------------------- Board -------------------------------------

function mountBoard(root) {
  const moveUrl = root.dataset.moveUrl;
  if (!moveUrl) return;

  root.querySelectorAll(".column-body").forEach((body) => {
    if (sortables.has(body)) return;

    const instance = window.Sortable.create(body, {
      group: "board",
      animation: 150,
      easing: "cubic-bezier(0.2, 0, 0.13, 1)",
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      draggable: ".card-item",
      // Long-press on touch so the column can still be scrolled with a finger.
      delayOnTouchOnly: true,
      delay: 160,
      fallbackOnBody: true,

      onStart() {
        root.dataset.dragging = "true";
      },

      onEnd(event) {
        delete root.dataset.dragging;

        const card = event.item;
        const target = event.to;
        const columnId = target.dataset.columnId;
        const index = [...target.querySelectorAll(".card-item")].indexOf(card);

        // Nothing actually changed.
        if (event.from === event.to && event.oldIndex === event.newIndex) return;

        flash(card);
        postMove(moveUrl, { itemId: card.dataset.itemId, columnId, index }, card);
      },

      onMove(event) {
        event.to.closest(".column")?.classList.add("drop-target");
        if (event.from !== event.to) {
          event.from.closest(".column")?.classList.remove("drop-target");
        }
        return true;
      },
    });

    sortables.set(body, instance);
  });

  // Clear the drop highlight whenever a drag finishes anywhere on the board.
  root.addEventListener("dragend", () => {
    root.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  });
}

// ------------------------------ Backlog ------------------------------------

function mountBacklog(root) {
  const moveUrl = root.dataset.moveUrl;
  if (!moveUrl) return;

  root.querySelectorAll(".backlog-rows").forEach((list) => {
    if (sortables.has(list)) return;

    const instance = window.Sortable.create(list, {
      group: "backlog",
      animation: 150,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      draggable: ".backlog-row",
      handle: ".drag-handle",
      delayOnTouchOnly: true,
      delay: 160,
      fallbackOnBody: true,

      onEnd(event) {
        const row = event.item;
        const target = event.to;
        // Empty string means "back to the unassigned backlog".
        const sprintId = target.dataset.sprintId ?? "";
        const index = [...target.querySelectorAll(".backlog-row")].indexOf(row);

        if (event.from === event.to && event.oldIndex === event.newIndex) return;

        flash(row);
        postMove(moveUrl, { itemId: row.dataset.itemId, sprintId, index }, row);
      },
    });

    sortables.set(list, instance);
  });
}

// ------------------------------- Wiring ------------------------------------

/**
 * The drag handle sits inside a row that opens the item dialog on click.
 * Delegated here rather than as an inline onclick so the markup stays free of
 * event-handler attributes (and a strict CSP stays possible).
 */
document.addEventListener("click", (event) => {
  if (event.target.closest(".drag-handle")) event.stopPropagation();
}, true);

function mountAll(scope = document) {
  scope.querySelectorAll?.("[data-board]").forEach(mountBoard);
  scope.querySelectorAll?.("[data-backlog]").forEach(mountBacklog);

  if (scope.matches?.("[data-board]")) mountBoard(scope);
  if (scope.matches?.("[data-backlog]")) mountBacklog(scope);
}

document.addEventListener("DOMContentLoaded", () => mountAll());
// Re-mount after htmx replaces a list.
document.addEventListener("htmx:afterSwap", (event) => mountAll(event.target));
document.addEventListener("htmx:load", (event) => mountAll(event.target));

export { itemIds, mountAll };
