import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Development seed: two plans that show every feature with realistic data.
 * Safe to re-run - it clears the demo users and their plans first.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_USERS = [
  { email: "ada@example.com", name: "Ada Lovelace" },
  { email: "grace@example.com", name: "Grace Hopper" },
  { email: "alan@example.com", name: "Alan Turing" },
];

const DAY = 86_400_000;
const RANK_STEP = 1024;

async function main() {
  console.log("Seeding...");

  // Remove anything from a previous run so the seed is idempotent.
  await db.user.deleteMany({ where: { email: { in: DEMO_USERS.map((u) => u.email) } } });

  const users = await Promise.all(
    DEMO_USERS.map((user) =>
      db.user.create({
        data: { ...user, googleId: `dev:${user.email}` },
      }),
    ),
  );

  const [ada, grace, alan] = users as [
    (typeof users)[number],
    (typeof users)[number],
    (typeof users)[number],
  ];

  // ------------------------------------------------------------- work plan
  const work = await db.plan.create({
    data: {
      slug: "product-team",
      key: "PT",
      name: "Product team",
      description: "Everything the product squad is shipping this quarter.",
      emoji: "\u{1F680}",
      color: "blue",
      members: {
        create: [
          { userId: ada.id, role: "OWNER" },
          { userId: grace.id, role: "ADMIN" },
          { userId: alan.id, role: "MEMBER" },
        ],
      },
      labels: {
        createMany: {
          data: [
            { name: "bug", color: "red" },
            { name: "feature", color: "green" },
            { name: "design", color: "purple" },
            { name: "urgent", color: "orange" },
          ],
        },
      },
    },
  });

  const workBoard = await db.board.create({
    data: {
      planId: work.id,
      name: "Board",
      columns: {
        createMany: {
          data: [
            { name: "To do", category: "TODO", position: 0 },
            { name: "In progress", category: "IN_PROGRESS", position: 1, wipLimit: 3 },
            { name: "In review", category: "IN_PROGRESS", position: 2, wipLimit: 2 },
            { name: "Done", category: "DONE", position: 3 },
          ],
        },
      },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });

  const [todo, doing, review, done] = workBoard.columns as [
    (typeof workBoard.columns)[number],
    (typeof workBoard.columns)[number],
    (typeof workBoard.columns)[number],
    (typeof workBoard.columns)[number],
  ];

  const labels = await db.label.findMany({ where: { planId: work.id } });
  const labelId = (name: string) => labels.find((l) => l.name === name)?.id;

  const sprint = await db.sprint.create({
    data: {
      planId: work.id,
      name: "Sprint 12",
      goal: "Ship the new onboarding flow and clear the top three bugs.",
      state: "ACTIVE",
      position: 0,
      startDate: new Date(Date.now() - 6 * DAY),
      endDate: new Date(Date.now() + 8 * DAY),
    },
  });

  const nextSprint = await db.sprint.create({
    data: {
      planId: work.id,
      name: "Sprint 13",
      goal: "Billing and usage limits.",
      state: "PLANNED",
      position: 1,
      startDate: new Date(Date.now() + 9 * DAY),
      endDate: new Date(Date.now() + 22 * DAY),
    },
  });

  interface SeedItem {
    title: string;
    type: "TASK" | "STORY" | "BUG" | "EPIC" | "CHORE";
    priority: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    columnId: string;
    sprintId: string | null;
    assigneeId?: string;
    points?: number;
    labels?: string[];
    /** Days ago the item was completed; omit for open items. */
    completedDaysAgo?: number;
    dueInDays?: number;
    description?: string;
  }

  const workItems: SeedItem[] = [
    {
      title: "Design the new onboarding flow",
      type: "STORY",
      priority: "HIGH",
      columnId: done.id,
      sprintId: sprint.id,
      assigneeId: grace.id,
      points: 5,
      labels: ["design", "feature"],
      completedDaysAgo: 5,
      description: "Three screens: welcome, workspace setup, invite teammates.",
    },
    {
      title: "Build the workspace setup screen",
      type: "STORY",
      priority: "HIGH",
      columnId: done.id,
      sprintId: sprint.id,
      assigneeId: ada.id,
      points: 8,
      labels: ["feature"],
      completedDaysAgo: 2,
    },
    {
      title: "Invite teammates step",
      type: "STORY",
      priority: "MEDIUM",
      columnId: review.id,
      sprintId: sprint.id,
      assigneeId: alan.id,
      points: 5,
      labels: ["feature"],
      dueInDays: 2,
    },
    {
      title: "Session cookie expires far too early",
      type: "BUG",
      priority: "URGENT",
      columnId: doing.id,
      sprintId: sprint.id,
      assigneeId: ada.id,
      points: 3,
      labels: ["bug", "urgent"],
      dueInDays: 1,
      description: "Reported by three customers. Sessions drop after roughly an hour.",
    },
    {
      title: "Board drag handle is invisible on touch devices",
      type: "BUG",
      priority: "HIGH",
      columnId: doing.id,
      sprintId: sprint.id,
      assigneeId: grace.id,
      points: 2,
      labels: ["bug"],
      dueInDays: -1,
    },
    {
      title: "Empty states across the app",
      type: "TASK",
      priority: "LOW",
      columnId: todo.id,
      sprintId: sprint.id,
      points: 2,
      labels: ["design"],
    },
    {
      title: "Keyboard shortcuts help dialog",
      type: "TASK",
      priority: "LOW",
      columnId: todo.id,
      sprintId: sprint.id,
      points: 3,
    },
    // Backlog: not in any sprint.
    {
      title: "Usage-based billing",
      type: "EPIC",
      priority: "MEDIUM",
      columnId: todo.id,
      sprintId: nextSprint.id,
      points: 13,
    },
    {
      title: "Stripe webhook handling",
      type: "STORY",
      priority: "MEDIUM",
      columnId: todo.id,
      sprintId: nextSprint.id,
      points: 8,
    },
    {
      title: "Export a plan to CSV",
      type: "STORY",
      priority: "LOW",
      columnId: todo.id,
      sprintId: null,
      points: 5,
    },
    {
      title: "Upgrade to Postgres 17",
      type: "CHORE",
      priority: "NONE",
      columnId: todo.id,
      sprintId: null,
      points: 2,
    },
    {
      title: "Dark mode polish pass",
      type: "TASK",
      priority: "LOW",
      columnId: todo.id,
      sprintId: null,
      labels: ["design"],
    },
  ];

  let counter = 0;
  for (const [index, entry] of workItems.entries()) {
    counter += 1;
    const item = await db.item.create({
      data: {
        planId: work.id,
        boardId: workBoard.id,
        columnId: entry.columnId,
        number: counter,
        key: `${work.key}-${counter}`,
        title: entry.title,
        description: entry.description ?? null,
        type: entry.type,
        priority: entry.priority,
        storyPoints: entry.points ?? null,
        rank: index * RANK_STEP,
        assigneeId: entry.assigneeId ?? null,
        reporterId: ada.id,
        sprintId: entry.sprintId,
        dueDate: entry.dueInDays !== undefined ? new Date(Date.now() + entry.dueInDays * DAY) : null,
        completedAt:
          entry.completedDaysAgo !== undefined
            ? new Date(Date.now() - entry.completedDaysAgo * DAY)
            : null,
      },
    });

    for (const name of entry.labels ?? []) {
      const id = labelId(name);
      if (id) await db.itemLabel.create({ data: { itemId: item.id, labelId: id } });
    }

    await db.activity.create({
      data: {
        planId: work.id,
        itemId: item.id,
        userId: ada.id,
        action: "item.created",
        meta: { key: item.key, title: item.title },
        createdAt: new Date(Date.now() - (workItems.length - index) * 3 * 3_600_000),
      },
    });
  }

  await db.plan.update({ where: { id: work.id }, data: { itemCounter: counter } });

  // A couple of comments so the dialog is not empty.
  const bug = await db.item.findFirst({
    where: { planId: work.id, title: { contains: "Session cookie" } },
  });
  if (bug) {
    await db.comment.createMany({
      data: [
        {
          itemId: bug.id,
          userId: grace.id,
          body: "Reproduced it. The cookie has no Expires attribute, so it becomes a session cookie.",
        },
        {
          itemId: bug.id,
          userId: ada.id,
          body: "Good catch. Fix is in review now.",
        },
      ],
    });

    await db.checklistItem.createMany({
      data: [
        { itemId: bug.id, text: "Reproduce with a fresh browser profile", done: true, position: 0 },
        { itemId: bug.id, text: "Set Expires on the session cookie", done: true, position: 1024 },
        { itemId: bug.id, text: "Add a regression test", done: false, position: 2048 },
      ],
    });
  }

  await db.activity.createMany({
    data: [
      {
        planId: work.id,
        userId: ada.id,
        sprintId: sprint.id,
        action: "sprint.started",
        meta: { name: sprint.name },
        createdAt: new Date(Date.now() - 6 * DAY),
      },
      {
        planId: work.id,
        userId: grace.id,
        action: "member.joined",
        meta: { name: grace.name },
        createdAt: new Date(Date.now() - 20 * DAY),
      },
    ],
  });

  await db.whiteboard.create({
    data: {
      planId: work.id,
      createdById: grace.id,
      name: "Onboarding flow sketch",
      scene: [
        { id: "s1", type: "note", x: 40, y: 40, w: 180, h: 140, color: "#f3d34a", text: "Welcome screen" },
        { id: "s2", type: "note", x: 280, y: 40, w: 180, h: 140, color: "#f3d34a", text: "Workspace setup" },
        { id: "s3", type: "note", x: 520, y: 40, w: 180, h: 140, color: "#f3d34a", text: "Invite teammates" },
        { id: "a1", type: "arrow", x1: 230, y1: 110, x2: 270, y2: 110, color: "#2383e2", width: 3 },
        { id: "a2", type: "arrow", x1: 470, y1: 110, x2: 510, y2: 110, color: "#2383e2", width: 3 },
        { id: "t1", type: "text", x: 40, y: 220, color: "#37352f", size: 18, text: "Three steps, no dead ends." },
      ],
    },
  });

  // ------------------------------------------------------------ life plan
  const life = await db.plan.create({
    data: {
      slug: "personal",
      key: "ME",
      name: "Personal",
      description: "Life admin, health and the things that are not work.",
      emoji: "\u{1F3E0}",
      color: "green",
      itemCounter: 4,
      members: { create: [{ userId: ada.id, role: "OWNER" }] },
    },
  });

  const lifeBoard = await db.board.create({
    data: {
      planId: life.id,
      columns: {
        createMany: {
          data: [
            { name: "Someday", category: "TODO", position: 0 },
            { name: "This week", category: "IN_PROGRESS", position: 1 },
            { name: "Done", category: "DONE", position: 2 },
          ],
        },
      },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });

  const lifeCols = lifeBoard.columns;
  const lifeItems = [
    { title: "Renew passport", col: 1, due: 5, priority: "HIGH" as const },
    { title: "Book the dentist", col: 1, due: 2, priority: "MEDIUM" as const },
    { title: "Plan the trip in March", col: 0, due: null, priority: "LOW" as const },
    { title: "Sort out home insurance", col: 0, due: 20, priority: "NONE" as const },
  ];

  for (const [index, entry] of lifeItems.entries()) {
    await db.item.create({
      data: {
        planId: life.id,
        boardId: lifeBoard.id,
        columnId: lifeCols[entry.col]?.id ?? null,
        number: index + 1,
        key: `${life.key}-${index + 1}`,
        title: entry.title,
        type: "TASK",
        priority: entry.priority,
        rank: index * RANK_STEP,
        reporterId: ada.id,
        assigneeId: ada.id,
        dueDate: entry.due === null ? null : new Date(Date.now() + entry.due * DAY),
      },
    });
  }

  console.log("\nSeeded:");
  console.log(`  ${work.emoji} ${work.name}  ->  /p/${work.slug}/board`);
  console.log(`  ${life.emoji} ${life.name}  ->  /p/${life.slug}/board`);
  console.log("\nSign in with development sign-in as any of:");
  for (const user of DEMO_USERS) console.log(`  ${user.email}  (${user.name})`);
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
