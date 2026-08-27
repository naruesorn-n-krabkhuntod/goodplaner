import { describe, expect, it } from "bun:test";
import { buildBurndown, sprintStats } from "~/lib/burndown";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

describe("buildBurndown", () => {
  it("sums story points into the starting total", () => {
    const { total } = buildBurndown(
      [
        { storyPoints: 3, completedAt: null },
        { storyPoints: 5, completedAt: null },
        { storyPoints: null, completedAt: null },
      ],
      daysAgo(2),
      daysAhead(2),
    );
    expect(total).toBe(8);
  });

  it("emits one point per day inclusive of both ends", () => {
    const { points } = buildBurndown([], daysAgo(3), daysAhead(3));
    expect(points).toHaveLength(7);
  });

  it("burns down as items are completed", () => {
    const { points, total } = buildBurndown(
      [
        { storyPoints: 5, completedAt: daysAgo(3) },
        { storyPoints: 5, completedAt: daysAgo(1) },
        { storyPoints: 5, completedAt: null },
      ],
      daysAgo(4),
      daysAhead(1),
    );

    expect(total).toBe(15);
    // Day 0 is before anything was finished.
    expect(points[0]!.remaining).toBe(15);
    // By the last measured day, ten points are gone.
    const measured = points.filter((p) => !p.future);
    expect(measured[measured.length - 1]!.remaining).toBe(5);
  });

  it("never reports negative remaining work", () => {
    const { points } = buildBurndown(
      [{ storyPoints: 5, completedAt: daysAgo(2) }],
      daysAgo(3),
      daysAhead(1),
    );
    expect(points.every((p) => p.remaining >= 0)).toBe(true);
  });

  it("draws an ideal line from the total down to zero", () => {
    const { points } = buildBurndown(
      [{ storyPoints: 10, completedAt: null }],
      daysAgo(2),
      daysAhead(2),
    );
    expect(points[0]!.ideal).toBeCloseTo(10, 5);
    expect(points[points.length - 1]!.ideal).toBeCloseTo(0, 5);
  });

  it("marks days after today as projected", () => {
    const { points } = buildBurndown([], daysAgo(2), daysAhead(3));
    expect(points.some((p) => p.future)).toBe(true);
    expect(points[0]!.future).toBe(false);
  });

  it("survives a one-day sprint without dividing by zero", () => {
    const { points } = buildBurndown(
      [{ storyPoints: 3, completedAt: null }],
      daysAgo(0),
      daysAgo(0),
    );
    expect(points.every((p) => Number.isFinite(p.ideal))).toBe(true);
  });
});

describe("sprintStats", () => {
  it("counts items and points, done and total", () => {
    const stats = sprintStats(
      [
        { storyPoints: 3, completedAt: daysAgo(1) },
        { storyPoints: 5, completedAt: null },
        { storyPoints: null, completedAt: daysAgo(2) },
      ],
      daysAhead(4),
    );

    expect(stats.totalItems).toBe(3);
    expect(stats.doneItems).toBe(2);
    expect(stats.totalPoints).toBe(8);
    expect(stats.donePoints).toBe(3);
  });

  it("reports days remaining, going negative once overdue", () => {
    expect(sprintStats([], daysAhead(5)).daysRemaining).toBe(5);
    expect(sprintStats([], daysAgo(2)).daysRemaining).toBe(-2);
  });

  it("reports null days remaining when the sprint has no end date", () => {
    expect(sprintStats([], null).daysRemaining).toBeNull();
  });
});
