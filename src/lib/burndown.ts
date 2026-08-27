/**
 * Sprint burndown.
 *
 * The actual line is derived from each item's `completedAt`, so it stays
 * correct without a nightly snapshot job. Items without story points count as
 * zero, which is why the chart also reports an item count alongside points.
 */

export interface BurndownPoint {
  date: Date;
  /** Points still open at the end of this day. */
  remaining: number;
  /** Straight line from the starting total down to zero on the end date. */
  ideal: number;
  /** Days after today are projected, not measured. */
  future: boolean;
}

export interface BurndownItem {
  storyPoints: number | null;
  completedAt: Date | null;
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function buildBurndown(
  items: BurndownItem[],
  startDate: Date,
  endDate: Date,
): { points: BurndownPoint[]; total: number } {
  const total = items.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);

  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const today = startOfDay(new Date());

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const points: BurndownPoint[] = [];

  for (let offset = 0; offset <= days; offset++) {
    const date = new Date(start.getTime() + offset * DAY_MS);
    const future = date.getTime() > today.getTime();

    const burned = items.reduce((sum, item) => {
      if (!item.completedAt) return sum;
      // Count an item on the day it was finished.
      if (startOfDay(item.completedAt).getTime() <= date.getTime()) {
        return sum + (item.storyPoints ?? 0);
      }
      return sum;
    }, 0);

    points.push({
      date,
      remaining: Math.max(0, total - burned),
      ideal: total - (total * offset) / days,
      future,
    });
  }

  return { points, total };
}

export interface SprintStats {
  totalItems: number;
  doneItems: number;
  totalPoints: number;
  donePoints: number;
  /** Whole days left, negative once the end date has passed. */
  daysRemaining: number | null;
}

export function sprintStats(
  items: { storyPoints: number | null; completedAt: Date | null }[],
  endDate: Date | null,
): SprintStats {
  const totalPoints = items.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0);
  const donePoints = items.reduce(
    (sum, i) => sum + (i.completedAt ? (i.storyPoints ?? 0) : 0),
    0,
  );

  return {
    totalItems: items.length,
    doneItems: items.filter((i) => i.completedAt).length,
    totalPoints,
    donePoints,
    daysRemaining: endDate
      ? Math.ceil((startOfDay(endDate).getTime() - startOfDay(new Date()).getTime()) / DAY_MS)
      : null,
  };
}
