/**
 * Plan-scoped broadcast over Bun's native WebSocket pub/sub.
 *
 * Elysia's `.ws()` handles subscription; publishing goes through the Bun server
 * handle, which is only available once the app is listening - hence the setter.
 *
 * Only the publish method is needed, so the handle is kept behind a minimal
 * structural type rather than Bun's generic `Server<T>`.
 */

interface Publisher {
  publish(topic: string, data: string): number;
}

let server: Publisher | null = null;

export function bindRealtimeServer(instance: Publisher | null | undefined) {
  server = instance ?? null;
}

export function planTopic(planId: string): string {
  return `plan:${planId}`;
}

export type RealtimeEvent =
  | "item.changed"
  | "sprint.changed"
  | "whiteboard.updated"
  | "member.changed";

/**
 * Fire-and-forget broadcast. Never throws: a realtime failure must not take
 * down the request that triggered it, since the HTTP response is the source
 * of truth and the client re-syncs on its next fetch.
 */
export function publishToPlan(planId: string, type: RealtimeEvent, payload: unknown = {}) {
  if (!server) return;
  try {
    server.publish(planTopic(planId), JSON.stringify({ type, payload }));
  } catch (error) {
    console.error("realtime publish failed", error);
  }
}
