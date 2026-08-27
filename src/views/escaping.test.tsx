import { describe, expect, it } from "bun:test";
import { LabelChip, Toast } from "~/views/components";
import { BacklogRow, ItemCard, ItemRow } from "~/views/item";

/**
 * @kitajs/html does NOT escape text children by default - only attribute
 * delimiters. Any component rendering user-supplied text must therefore carry
 * the `safe` attribute, or the app has a stored XSS hole.
 *
 * These tests answer the question that actually matters: after rendering a
 * payload, does a real HTML parser see an executable script element or an
 * event-handler attribute? A raw `<` sitting inside a quoted attribute is inert
 * and correctly ignored here, so the assertion is about exploitability rather
 * than about which characters happen to appear in the string.
 */

const SCRIPT_PAYLOAD = `<script>alert('xss')</script>`;
const BREAKOUT_PAYLOAD = `" onmouseover="alert(1)`;
const IMG_PAYLOAD = `<img src=x onerror=alert(1)>`;

interface ParseResult {
  scriptElements: number;
  injectedElements: string[];
  eventHandlers: string[];
}

/** Parses the fragment and reports anything that could execute. */
async function analyse(html: string): Promise<ParseResult> {
  const result: ParseResult = { scriptElements: 0, injectedElements: [], eventHandlers: [] };

  const rewriter = new HTMLRewriter().on("*", {
    element(element) {
      if (element.tagName === "script") result.scriptElements++;
      if (element.tagName === "img") result.injectedElements.push("img");

      for (const [name] of element.attributes) {
        if (name.toLowerCase().startsWith("on")) result.eventHandlers.push(name);
      }
    },
  });

  await rewriter.transform(new Response(html)).text();
  return result;
}

function itemFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "item1",
    planId: "plan1",
    boardId: "board1",
    columnId: "col1",
    number: 1,
    key: "GP-1",
    title: SCRIPT_PAYLOAD,
    description: null,
    type: "TASK",
    priority: "NONE",
    storyPoints: null,
    rank: 0,
    assigneeId: null,
    reporterId: "user1",
    sprintId: null,
    parentId: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignee: null,
    labels: [],
    _count: { comments: 0, children: 0 },
    ...overrides,
  } as never;
}

async function expectInert(html: string) {
  const found = await analyse(html);
  expect(found.scriptElements).toBe(0);
  expect(found.injectedElements).toEqual([]);
  expect(found.eventHandlers).toEqual([]);
}

describe("escaping user-supplied text", () => {
  it("neutralises a script payload in an item title on a board card", async () => {
    const html = await ItemCard({ item: itemFixture(), slug: "demo" });
    await expectInert(html);
    // The title is still shown to the user, just escaped.
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralises a script payload on a backlog row", async () => {
    await expectInert(await BacklogRow({ item: itemFixture(), slug: "demo" }));
  });

  it("neutralises a script payload on a list row", async () => {
    await expectInert(await ItemRow({ item: itemFixture(), slug: "demo" }));
  });

  it("neutralises an img/onerror payload", async () => {
    await expectInert(await ItemCard({ item: itemFixture({ title: IMG_PAYLOAD }), slug: "demo" }));
  });

  it("stops an attribute break-out through the assignee name", async () => {
    const html = await ItemCard({
      item: itemFixture({
        title: "safe title",
        assignee: { id: "u1", name: BREAKOUT_PAYLOAD, avatarUrl: null },
      }),
      slug: "demo",
    });
    await expectInert(html);
  });

  it("neutralises a payload in a label name", async () => {
    await expectInert(await LabelChip({ name: SCRIPT_PAYLOAD, color: "blue" }));
  });

  it("neutralises a payload in a toast message", async () => {
    await expectInert(await Toast({ message: SCRIPT_PAYLOAD, variant: "error" }));
  });

  it("neutralises a payload in a plan name beside a search result", async () => {
    await expectInert(
      await ItemRow({
        item: itemFixture({ title: "safe title" }),
        slug: "demo",
        showPlan: { emoji: "\u{1F4CB}", name: SCRIPT_PAYLOAD },
      }),
    );
  });
});

describe("the escaping helper itself", () => {
  it("would catch an unescaped title, proving the tests are not vacuous", async () => {
    // A deliberately unsafe render: no `safe` attribute on the text child.
    const unsafe = `<p class="card-item-title">${SCRIPT_PAYLOAD}</p>`;
    const found = await analyse(unsafe);
    expect(found.scriptElements).toBe(1);
  });
});
