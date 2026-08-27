/**
 * Plan-scoped realtime channel.
 *
 * Connects to the plan WebSocket and re-broadcasts server events to local
 * listeners. The app stays fully usable if this never connects - it only makes
 * other people's changes appear without a refresh.
 */

const listeners = new Map();
let socket = null;
let retry = 0;
let planId = null;

function emit(type, payload) {
  for (const handler of listeners.get(type) ?? []) {
    try {
      handler(payload);
    } catch (error) {
      console.error("realtime handler failed", error);
    }
  }
}

function connect() {
  if (!planId) return;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws/plan/${planId}`);

  socket.addEventListener("open", () => {
    retry = 0;
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message?.type) emit(message.type, message.payload ?? {});
  });

  socket.addEventListener("close", () => {
    socket = null;
    // Exponential backoff, capped, so a server restart does not hammer it.
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 500 * 2 ** retry);
  });

  socket.addEventListener("error", () => socket?.close());
}

const realtime = {
  /** Subscribe to a server event type. Returns an unsubscribe function. */
  on(type, handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  },

  /** Refetch the element that owns a live region when its data changed remotely. */
  refresh(selector) {
    const el = document.querySelector(selector);
    if (el && window.htmx) window.htmx.trigger(el, "gp:refresh");
  },
};

window.gpRealtime = realtime;

document.addEventListener("DOMContentLoaded", () => {
  const host = document.querySelector("[data-plan-id]");
  if (!host) return;
  planId = host.dataset.planId;
  connect();
});

// Board and backlog pages refresh themselves when someone else changes an item.
document.addEventListener("DOMContentLoaded", () => {
  realtime.on("item.changed", () => realtime.refresh("[data-live-region]"));
  realtime.on("sprint.changed", () => realtime.refresh("[data-live-region]"));
});

export { realtime };
