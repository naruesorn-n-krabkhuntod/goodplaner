import { describe, expect, it } from "bun:test";
import { needsRebalance, rankBetween, rankForIndex, spreadRanks } from "~/lib/rank";

describe("rankBetween", () => {
  it("starts at zero for an empty list", () => {
    expect(rankBetween(null, null)).toBe(0);
  });

  it("appends after the last item", () => {
    expect(rankBetween(100, null)).toBeGreaterThan(100);
  });

  it("prepends before the first item", () => {
    expect(rankBetween(null, 100)).toBeLessThan(100);
  });

  it("lands strictly between two neighbours", () => {
    const rank = rankBetween(10, 20);
    expect(rank).toBeGreaterThan(10);
    expect(rank).toBeLessThan(20);
  });

  it("keeps subdividing the same gap without collision", () => {
    let low = 0;
    const high = 1;
    for (let i = 0; i < 20; i++) {
      const next = rankBetween(low, high);
      expect(next).toBeGreaterThan(low);
      expect(next).toBeLessThan(high);
      low = next;
    }
  });
});

describe("needsRebalance", () => {
  it("is false at the ends of a list", () => {
    expect(needsRebalance(null, 5)).toBe(false);
    expect(needsRebalance(5, null)).toBe(false);
  });

  it("is false for a comfortable gap", () => {
    expect(needsRebalance(0, 1024)).toBe(false);
  });

  it("flags a gap too small to subdivide safely", () => {
    expect(needsRebalance(1, 1 + 1e-9)).toBe(true);
  });
});

describe("rankForIndex", () => {
  const ranks = [0, 1024, 2048];

  it("puts index 0 before everything", () => {
    expect(rankForIndex(ranks, 0)).toBeLessThan(0);
  });

  it("puts the final index after everything", () => {
    expect(rankForIndex(ranks, 3)).toBeGreaterThan(2048);
  });

  it("puts a middle index between its neighbours", () => {
    const rank = rankForIndex(ranks, 1);
    expect(rank).toBeGreaterThan(0);
    expect(rank).toBeLessThan(1024);
  });

  it("handles an empty destination list", () => {
    expect(rankForIndex([], 0)).toBe(0);
  });
});

describe("spreadRanks", () => {
  it("produces strictly ascending ranks", () => {
    const ranks = spreadRanks(5);
    expect(ranks).toHaveLength(5);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!).toBeGreaterThan(ranks[i - 1]!);
    }
  });
});

/**
 * The ordering contract the board and backlog both depend on: applying a move
 * and re-sorting by rank must produce the order the user dropped things into.
 */
describe("reordering end to end", () => {
  function move(order: { id: string; rank: number }[], id: string, toIndex: number) {
    const others = order.filter((item) => item.id !== id).sort((a, b) => a.rank - b.rank);
    const rank = rankForIndex(
      others.map((o) => o.rank),
      toIndex,
    );
    return [...others, { id, rank }].sort((a, b) => a.rank - b.rank).map((o) => o.id);
  }

  const list = [
    { id: "a", rank: 0 },
    { id: "b", rank: 1024 },
    { id: "c", rank: 2048 },
    { id: "d", rank: 3072 },
  ];

  it("moves an item to the top", () => {
    expect(move(list, "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("moves an item to the bottom", () => {
    expect(move(list, "a", 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("moves an item into the middle", () => {
    expect(move(list, "a", 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("is a no-op when dropped back where it started", () => {
    expect(move(list, "b", 1)).toEqual(["a", "b", "c", "d"]);
  });
});
