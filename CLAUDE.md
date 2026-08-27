# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

`goodplaner` — a planner for work and life. Plans are workspaces; each has a
Jira-style board, a ranked backlog, Scrum sprints with burndown, whiteboards,
members and an activity log. Sign-in is Google only.

See [README.md](README.md) for setup and a feature tour.

- Runtime: **Bun** (use `bun`, never npm/node)
- Server: **Elysia 1.4.30**, server-rendered JSX
- Frontend: **htmx 2 + Alpine.js**, no client framework
- Database: **PostgreSQL** via **Prisma 7.10** with the pg driver adapter
- Language: TypeScript 7, `strict`, ESM, path alias `~/*` → `src/*`

## Commands

```bash
bun run dev            # watch-mode dev server
bun run check          # typecheck + tests (run before saying work is done)
bun run db:migrate:dev # after any schema change
bun run db:seed        # reseed demo data
```

Bun is installed at `~/.bun/bin/bun` and may not be on PATH in every shell.

## Working agreements

Three guides in `.claude/agents/` define how work is done here. Consult the
relevant one before writing code, and follow it over generic habits.

| Guide | Scope |
| --- | --- |
| [`elysia-expert.md`](.claude/agents/elysia-expert.md) | Routes, plugins, macros, validation, lifecycle, WebSocket, error handling |
| [`frontend-developer.md`](.claude/agents/frontend-developer.md) | Client-side JS islands, performance, tests |
| [`ui-ux-designer.md`](.claude/agents/ui-ux-designer.md) | Design system, hierarchy, spacing, colour, accessibility, UI patterns |

## Non-obvious things that will bite you

These were all discovered the hard way. Do not rediscover them.

### `@kitajs/html` does not escape text children

`@elysiajs/html` renders through `@kitajs/html`, which escapes **attribute
delimiters but not text children**. So `<p>{item.title}</p>` is a stored-XSS
hole and `<p safe>{item.title}</p>` is not.

**Every element rendering user-supplied text must carry `safe`.** Item titles,
descriptions, comments, plan and sprint names, label names, user names, emails.

`bunx xss-scan` (the official scanner) is broken under TypeScript 7 — it calls
the old compiler API. [`src/views/escaping.test.tsx`](src/views/escaping.test.tsx)
covers the same ground instead: it renders payloads and uses `HTMLRewriter` to
assert no script element or event-handler attribute survives. Add a case there
when you add a component that renders user text.

### Elysia `scoped` propagates exactly one level

A `{ as: "scoped" }` hook or resolve reaches the instance that `.use()`s it, and
no further. Nesting `authed` inside another plugin silently drops `currentUser`
from the route modules that mount it — the failure is a type error at best and
`undefined` at runtime at worst.

That is why [`plan-scope.ts`](src/plugins/plan-scope.ts) repeats the sign-in
guard inline instead of composing `authed`. If you add a plugin that supplies
context, mount it directly in the route module that consumes it.

### No inline event handlers

There are none anywhere in `src/`, deliberately — it keeps a strict CSP
reachable and lets the escaping test assert "zero event-handler attributes".
Use delegated listeners in `public/js/app.js` or `board.js` instead
(`[data-copy]` and `.drag-handle` are the existing examples).

### Alpine modifiers break JSX

`x-on:click.self` is not a valid JSX attribute name (the dots). Spread those
through the `ax()` helper in [`src/views/alpine.ts`](src/views/alpine.ts):

```tsx
<div {...ax({ "x-on:click.self": "close()" })}>
```

Directives without modifiers (`x-data`, `x-show`, `x-on:click`) are fine as
plain attributes. Boolean-looking ones need an explicit value: `x-cloak=""`.

### Prisma 7 differs from 6

- The connection URL lives in `prisma.config.ts`, **not** in `schema.prisma`.
- `PrismaClient` needs the `PrismaPg` driver adapter (see `src/lib/db.ts`).
- Prisma no longer loads `.env` itself; `prisma.config.ts` imports `dotenv/config`.
- CLI flags were renamed: `migrate diff --to-schema`, not `--to-schema-datamodel`.
- Keep `prisma` and `@prisma/client` on the **same** version. `bun add -d prisma`
  resolves to an 8.x release candidate — pin it.

### TypeScript 7 removed `baseUrl`

`paths` are resolved relative to `tsconfig.json`, so entries need a leading
`./`. The htmx/Alpine JSX augmentations cannot be loaded through the `types`
array either; they are referenced by path from `src/globals.d.ts`.

### Port 3000

Another project on this machine occupies port 3000. The local `.env` uses 3100.
If you change `PORT`, change `APP_URL` too — the Google redirect URI must match
it exactly.

## Backend conventions

- **Validate every input.** Routes declare `body` / `query` / `params` schemas
  with TypeBox (`t` from `elysia`), the default and fastest option.
- **Let types be inferred** from schemas; do not hand-annotate handler params.
- **Authorise before mutating.** Plan routes use `planScope`, then call
  `assertCan(access, "capability")`. Roles are a strict ladder in
  [`src/lib/access.ts`](src/lib/access.ts); never compare roles inline.
- **Not-found beats forbidden** for plans the user is not a member of, so the
  endpoint does not confirm they exist.
- **Log what teammates would want to see** via `logActivity`. It swallows its
  own errors on purpose — losing a log line beats failing the user's action.
- **Broadcast after mutating** with `publishToPlan`. It is fire-and-forget; the
  HTTP response is the source of truth.
- One global `.onError` in `src/index.tsx` maps `AccessError`, `NOT_FOUND` and
  `VALIDATION` to responses, and returns bare text for htmx fragment requests.

### htmx conventions

- Fragment endpoints return the region they replace, identified by a stable id
  (`#board`, `#backlog`, `#sprints`, `#members`).
- Regions that update on realtime events carry `data-live-region` plus
  `hx-trigger="gp:refresh"`; `realtime.js` fires that event.
- Buttons that appear on more than one page inspect the `HX-Target` header and
  reply with the matching region — see `regionForRequest` in `sprints.tsx`.
- `HX-Toast` response header raises a toast; `app.js` reads it.

## Frontend and design conventions

- Ranking is fractional (`src/lib/rank.ts`): one `rank` float shared by the
  board and the backlog, so a move is a single-row update. Use `rankForDrop`.
- Drag-and-drop is pointer-only, so **every drag must have a keyboard
  equivalent** — the item dialog's Status and Sprint selects are it. Do not add
  a drag interaction without one.
- The design system lives in `public/css/tokens.css`. Use the tokens; do not
  introduce raw colours or off-scale spacing.
- WCAG 2.1 AA is the floor and is currently met at 4.55:1 minimum across both
  themes. If you change a colour, re-check its contrast against `--bg` (or its
  chip tint) before committing.
- Colour is never the only signal: pair it with text, a title, or a letter.
- Every interactive element ships hover, focus, active, disabled and, where
  relevant, loading and empty states.
