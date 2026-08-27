/** Presentation helpers shared by the views. */

const THAI_LOCALE = "en-GB"; // stable, unambiguous day/month ordering

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Stable 0-5 tint so a given person keeps one avatar colour everywhere. */
export function avatarTint(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % 6;
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString(THAI_LOCALE, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(THAI_LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(THAI_LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/** For <input type="date"> values. */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(due: Date | null | undefined, completed = false): DueState | null {
  if (!due || completed) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);

  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

export function dueLabel(due: Date, state: DueState): string {
  if (state === "today") return "Today";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);

  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (state === "overdue") return `${Math.abs(days)}d overdue`;
  return formatDate(due);
}

export function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  return formatDate(date);
}

/** "Today" / "Yesterday" / a date, used to group the activity log. */
export function dayLabel(date: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(THAI_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** URL-safe slug; falls back to a random suffix when the input has no usable characters. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return base || `plan-${Math.random().toString(36).slice(2, 8)}`;
}

/** Two-to-four letter prefix for item keys, e.g. "Marketing Site" -> "MS". */
export function deriveKey(name: string): string {
  const words = name
    .toUpperCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  if (words.length === 0) return "TASK";
  if (words.length === 1) return (words[0] ?? "").slice(0, 4) || "TASK";
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("");
}

export const PLAN_COLORS = [
  "blue",
  "purple",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "gray",
] as const;

export const PLAN_EMOJI = [
  "\u{1F4CB}", "\u{1F680}", "\u{1F3AF}", "\u{1F4A1}", "\u{1F4C8}", "\u{1F3A8}",
  "\u{1F3E0}", "\u{1F4B0}", "\u{1F4AA}", "\u{1F4DA}", "\u{2708}\u{FE0F}", "\u{1F331}",
  "\u{1F52C}", "\u{1F3B5}", "\u{1F373}", "\u{1F41B}",
] as const;

export const LABEL_COLORS = PLAN_COLORS;
