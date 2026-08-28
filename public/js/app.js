/**
 * Global client glue: theme, toasts, dialog focus handling and shortcuts.
 * Everything here degrades gracefully - the server always renders usable HTML.
 */

// ------------------------------ Theme -------------------------------------

const THEME_KEY = "gp-theme";

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode - the choice just will not persist */
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-theme-toggle]")) {
    event.preventDefault();
    toggleTheme();
  }
});

// ------------------------------ Toasts ------------------------------------

const TOAST_TTL = 4500;

function scheduleToastDismissal(toast) {
  if (toast.dataset.scheduled) return;
  toast.dataset.scheduled = "1";

  setTimeout(() => {
    toast.classList.add("leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    // Fallback for reduced-motion, where the animation is ~instant.
    setTimeout(() => toast.remove(), 400);
  }, TOAST_TTL);
}

function sweepToasts() {
  document.querySelectorAll(".toast").forEach(scheduleToastDismissal);
}

document.addEventListener("DOMContentLoaded", sweepToasts);
document.addEventListener("htmx:afterSwap", sweepToasts);

/** Lets any script raise a toast without a server round-trip. */
export function toast(message, variant = "info") {
  const region = document.getElementById("toasts");
  if (!region) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.dataset.variant = variant;
  el.setAttribute("role", "status");
  el.textContent = message;
  region.appendChild(el);
  scheduleToastDismissal(el);
}

window.gpToast = toast;

// --------------------------- Copy to clipboard -----------------------------

/** Any `[data-copy]` element copies its value; used by the invite links. */
document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-copy]");
  if (!trigger) return;

  event.preventDefault();
  try {
    await navigator.clipboard.writeText(trigger.dataset.copy);
    toast("Invite link copied", "success");
  } catch {
    // Clipboard access needs a secure context; tell the user rather than failing silently.
    toast("Could not copy. Select the link and copy it manually.", "error");
  }
});

// --------------------------- Dialog focus ---------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lastFocused = null;

/** Keeps Tab inside an open dialog, as the accessibility checklist requires. */
function trapFocus(event) {
  if (event.key !== "Tab") return;

  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog || !dialog.isConnected) return;

  const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", trapFocus);

function focusDialog(dialog) {
  lastFocused = document.activeElement;
  const target =
    dialog.querySelector("[autofocus]") ?? dialog.querySelector(FOCUSABLE) ?? dialog;
  target.focus?.();
}

// Focus a dialog as soon as htmx swaps one in, and restore focus when it goes.
new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      const dialog = node.matches?.('[role="dialog"]')
        ? node
        : node.querySelector?.('[role="dialog"]');
      if (dialog) focusDialog(dialog);
    }

    for (const node of record.removedNodes) {
      if (node.nodeType !== 1) continue;
      const hadDialog = node.matches?.('[role="dialog"]') || node.querySelector?.('[role="dialog"]');
      if (hadDialog && lastFocused?.isConnected) {
        lastFocused.focus();
        lastFocused = null;
      }
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

/** Modal children dispatch `close-modal`; clear whatever htmx put in #modal. */
window.addEventListener("close-modal", () => {
  const host = document.getElementById("modal");
  if (host) host.innerHTML = "";
});

// ---------------------------- Shortcuts -----------------------------------

document.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  const typing =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    document.activeElement?.isContentEditable;

  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  // "/" opens search, matching the hint shown in the sidebar.
  if (event.key === "/") {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("open-search"));
  }

  // "c" creates a new item on plan pages that expose the button.
  if (event.key === "c") {
    const create = document.querySelector("[data-shortcut-create]");
    if (create) {
      event.preventDefault();
      create.click();
    }
  }
});

// ------------------------------ htmx wiring --------------------------------

document.addEventListener("htmx:responseError", (event) => {
  const status = event.detail?.xhr?.status;
  toast(
    status === 403
      ? "You do not have permission to do that."
      : status === 404
        ? "That item no longer exists."
        : "Something went wrong. Please try again.",
    "error",
  );
});

document.addEventListener("htmx:sendError", () => {
  toast("Cannot reach the server. Check your connection.", "error");
});

/**
 * Server fragments can ask the browser to navigate by returning HX-Redirect,
 * which htmx handles, or raise a toast via the HX-Toast header.
 */
document.addEventListener("htmx:afterRequest", (event) => {
  const header = event.detail?.xhr?.getResponseHeader?.("HX-Toast");
  if (!header) return;
  try {
    const { message, variant } = JSON.parse(header);
    if (message) toast(message, variant ?? "info");
  } catch {
    toast(header);
  }
});

// ====================== Backlog multi-select Alpine component ================

/**
 * Tracks which backlog items are checked, and wires the "New sprint from N
 * items" form to send their ids as JSON before submission.
 *
 * Selection is persisted to sessionStorage so it survives the outerHTML swap
 * that htmx performs when a teammate's action triggers gp:refresh on #backlog.
 */
const _BP_KEY = "gp-bp-selected";

function backlogSelect() {
  return {
    selected: (() => {
      try { return JSON.parse(sessionStorage.getItem(_BP_KEY) || "[]"); } catch { return []; }
    })(),

    init() {
      // Keep sessionStorage in sync whenever selection changes.
      this.$watch("selected", (val) => {
        try { sessionStorage.setItem(_BP_KEY, JSON.stringify(val)); } catch {}
      });
    },

    /**
     * Called from the form's x-on:submit before htmx picks it up.
     * Injects hidden inputs for each selected id so the form body includes
     * itemIds[], which the server reads as an array.
     * Clears selection so the new backlog region that htmx swaps in starts empty.
     */
    appendSelectedIds(event) {
      const form = event.target;
      // Remove any previously injected inputs.
      form.querySelectorAll(".injected-item-id").forEach((el) => el.remove());
      this.selected.forEach((id) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "itemIds";
        input.value = id;
        input.className = "injected-item-id";
        form.appendChild(input);
      });
      // Clear — watcher writes [] to sessionStorage before htmx re-renders.
      this.selected = [];
    },
  };
}

// Expose for Alpine x-data="backlogSelect".
// Set on window immediately (before Alpine processes the DOM) AND register
// via Alpine.data() inside alpine:init so both lookup paths work.
window.backlogSelect = backlogSelect;
document.addEventListener("alpine:init", () => {
  if (window.Alpine) window.Alpine.data("backlogSelect", backlogSelect);
});
