/**
 * Fractional ranking.
 *
 * Every item carries one Float `rank` shared by the backlog and the board, which
 * is the same model Jira uses: reordering a card anywhere reorders it everywhere.
 * Moving an item is a single-row UPDATE - we never renumber its neighbours.
 */

/** Gap left between consecutive ranks when appending or prepending. */
const STEP = 1024;

/**
 * Doubles run out of room after roughly 50 successive subdivisions of one gap.
 * Well before that we flag the list for a rebalance.
 */
const MIN_GAP = 1e-6;

/**
 * Rank for an item dropped between `before` and `after`.
 * Pass `null` for either end of the list.
 */
export function rankBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - STEP;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

/** True when the neighbours are too close to subdivide again safely. */
export function needsRebalance(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false;
  return Math.abs(after - before) < MIN_GAP;
}

/**
 * Evenly spaced ranks for `count` items, used when seeding a list or after a
 * rebalance. Returns ranks in list order.
 */
export function spreadRanks(count: number, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => start + i * STEP);
}

/**
 * Resolve the rank for a move given the ordered ranks of the destination list
 * (excluding the item being moved) and the index it was dropped at.
 */
export function rankForIndex(orderedRanks: number[], index: number): number {
  const before = index > 0 ? (orderedRanks[index - 1] ?? null) : null;
  const after = index < orderedRanks.length ? (orderedRanks[index] ?? null) : null;
  return rankBetween(before, after);
}
