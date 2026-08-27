# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

`goodplaner` — an [Elysia](https://elysiajs.com) API server running on the Bun runtime.
Currently at the `bun create elysia` starter stage: `src/index.ts` holds a single
`GET /` route listening on port 3000. Everything beyond that is still to be built.

- Runtime: **Bun** (no Node, no npm — use `bun` for install/run/test)
- Framework: **Elysia 1.4.30** ("Supersymmetry")
- Language: **TypeScript**, `strict: true`, ESM (`module: ES2022`), `bun-types`

## Commands

```bash
bun install          # install dependencies
bun run dev          # dev server with --watch on http://localhost:3000
bun test             # bun:test runner (package.json "test" script is still the placeholder — replace it when the first test lands)
bunx tsc --noEmit    # typecheck
```

## Working agreements

Three guides in `.claude/agents/` define how work is done here. They are the
primary reference for this project — consult the relevant one before writing code,
and follow it over generic habits.

| Guide | Scope |
| --- | --- |
| [`.claude/agents/elysia-expert.md`](.claude/agents/elysia-expert.md) | All backend/API work: routes, plugins, macros, validation, lifecycle, WebSocket, error handling |
| [`.claude/agents/frontend-developer.md`](.claude/agents/frontend-developer.md) | All client-side UI code: components, state, styling, build tooling, tests, performance |
| [`.claude/agents/ui-ux-designer.md`](.claude/agents/ui-ux-designer.md) | Interface design and design-system decisions: hierarchy, spacing, color, accessibility, UI patterns |

Where they overlap (a UI feature backed by an API), apply all three: design the
interaction per `ui-ux-designer`, implement it per `frontend-developer`, and expose
it per `elysia-expert`.

## Backend conventions (from elysia-expert)

- **Validate every input.** Routes take `body` / `query` / `params` / `headers`
  schemas. TypeBox (`t` from `elysia`) is the default — it is the fastest and needs
  no extra dependency. Reach for Zod/Valibot/ArkType only when a specific need
  justifies the dependency, and stay consistent within a module.
- **Let types be inferred** from the schemas; do not hand-annotate handler params.
- **Compose with plugins and groups.** Feature routes live in their own Elysia
  instance and are mounted with `.use()`; version and shared-header concerns go on
  `.group()`. Group schemas compose with route schemas automatically in 1.4 — do not
  re-declare inherited headers.
- **Cross-cutting concerns are macros** (auth, roles, caching, rate limiting), not
  copy-pasted `onBeforeHandle` blocks.
- **One global `.onError`** maps `VALIDATION` / `NOT_FOUND` / `PARSE` /
  `INTERNAL_SERVER_ERROR` to consistent JSON shapes. Handlers throw or set status;
  they do not each invent an error format.
- **Declare `response` schemas** on routes that matter, including the error status
  codes, so the contract is checked rather than assumed.
- **Use Bun APIs directly** where they win: `Bun.file` for file serving, native
  streaming for large responses.
- Tests use `bun:test` and drive the app via `app.handle(new Request(...))` — no
  network listener needed.

One correction to the guide: its "Migration from v1.3 to v1.4" section claims the
`error()` context helper is gone and `set.status` is the replacement. In 1.4.30 the
helper still exists, renamed to `status` — `({ status }) => status(404, { ... })`.
Prefer it over `set.status`, since it is typed against the route's `response` schema.
Check any other API from that section against the installed types before relying on it.

## Frontend & design conventions

No frontend exists yet. When one is added, before writing components:

- Mobile-first, responsive layouts; touch targets at least 44x44px.
- WCAG 2.1 AA is the floor: 4.5:1 text contrast, full keyboard navigation, visible
  focus indicators, semantic HTML with ARIA only where semantics fall short, labels
  associated with inputs, and never color alone to convey meaning.
- Spacing follows the 4/8/16/24/32/48/64px scale; body text at 16px minimum with
  1.5–1.8 line height; at most 2–3 font families.
- Every interactive element ships all its states: hover, focus, active, disabled,
  loading, error, empty.
- Functional components with hooks; explicit loading and error boundaries;
  memoize only where a measured re-render problem exists.
- TypeScript throughout, matching the strictness of the backend.

## Repository notes

- `bun.lock` is committed and must stay in sync with `package.json`.
- `.gitignore` still carries leftovers from a Next.js template (`/.next/`,
  `/out/`, `.vercel`); harmless, but do not read them as evidence of a Next.js app.
