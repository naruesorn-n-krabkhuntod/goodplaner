import { t } from "elysia";

/**
 * Shared request-schema pieces.
 *
 * Form-encoded bodies arrive as strings and Elysia 1.4 does not coerce them
 * into `t.Number()` — a `t.Number()` field rejects `index=0` with a 422. The
 * drag-drop islands post form-encoded data through `htmx.ajax`, so list
 * positions are validated as digit strings and converted with `toIndex`.
 */
export const IndexField = t.String({ pattern: "^[0-9]{1,6}$" });

/** Parses an `IndexField` value. Falls back to 0 rather than throwing. */
export function toIndex(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}
