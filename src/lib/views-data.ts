import { db } from "~/lib/db";
import { itemCardInclude } from "~/lib/plans";
import type { BacklogGroupData } from "~/views/pages/backlog";

/**
 * Shared loaders for regions that more than one route renders.
 *
 * The backlog region is returned by the backlog page, by sprint create, and by
 * sprint start/complete, so its query lives here rather than being duplicated.
 */

/**
 * The plan's open items grouped by sprint, in planning order, with everything
 * unassigned last. Completed sprints are excluded - they live on the sprints page.
 */
export async function loadBacklogGroups(planId: string): Promise<BacklogGroupData[]> {
  const [sprints, items] = await Promise.all([
    db.sprint.findMany({
      where: { planId, state: { not: "COMPLETED" } },
      orderBy: { position: "asc" },
    }),
    db.item.findMany({
      where: {
        planId,
        archivedAt: null,
        OR: [{ sprintId: null }, { sprint: { state: { not: "COMPLETED" } } }],
      },
      include: itemCardInclude,
      orderBy: { rank: "asc" },
    }),
  ]);

  const groups: BacklogGroupData[] = sprints.map((sprint) => ({
    sprint,
    items: items.filter((item) => item.sprintId === sprint.id),
  }));

  groups.push({ sprint: null, items: items.filter((item) => item.sprintId === null) });
  return groups;
}
