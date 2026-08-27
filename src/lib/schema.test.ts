import { describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";
import { IndexField, toIndex } from "~/lib/schema";

/**
 * Regression cover for a bug found only by running the app: the drag-drop
 * islands post form-encoded bodies, where every value is a string. A
 * `t.Number()` field rejected `index=0` with a 422, so every card move failed
 * in the browser while passing every type check.
 */

describe("toIndex", () => {
  it("parses digit strings", () => {
    expect(toIndex("0")).toBe(0);
    expect(toIndex("7")).toBe(7);
    expect(toIndex("120")).toBe(120);
  });

  it("falls back to 0 rather than producing NaN", () => {
    expect(toIndex("abc")).toBe(0);
    expect(toIndex("")).toBe(0);
    expect(toIndex("-3")).toBe(0);
  });

  it("floors fractional input", () => {
    expect(toIndex("2.9")).toBe(2);
  });
});

describe("IndexField accepts what a form body actually sends", () => {
  const app = new Elysia().post("/move", ({ body }) => ({ index: toIndex(body.index) }), {
    body: t.Object({ index: IndexField }),
  });

  async function post(body: string) {
    return app.handle(
      new Request("http://localhost/move", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
  }

  it("accepts a form-encoded index and parses it to a number", async () => {
    const response = await post("index=0");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ index: 0 });
  });

  it("accepts a larger position", async () => {
    const response = await post("index=42");
    expect(await response.json()).toEqual({ index: 42 });
  });

  it("rejects a non-numeric index", async () => {
    expect((await post("index=abc")).status).toBe(422);
  });

  it("rejects a negative index", async () => {
    expect((await post("index=-1")).status).toBe(422);
  });
});
