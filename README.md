# GoodPlanner

A planner for work and life: Jira-style boards, a ranked backlog, Scrum sprints
with burndown charts, infinite-canvas whiteboards and a full activity log —
organised into **Plans**, which are workspaces you can invite people into.

Sign-in is **Google only**.

---

## Stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Runtime   | Bun                                                          |
| Server    | Elysia 1.4, server-rendered JSX (`@elysiajs/html`)           |
| Interaction | htmx 2 + Alpine.js, with JS islands for drag-drop and canvas |
| Styling   | Hand-written CSS design system, no build step                |
| Database  | PostgreSQL via Prisma 7 (pg driver adapter)                  |
| Realtime  | Elysia WebSocket, one topic per plan                         |

## Getting started

You need [Bun](https://bun.sh) and a PostgreSQL 17 database. The compose file
provides one:

```bash
cp .env.example .env
```

Then fill in `.env` and run:

```bash
bun run setup
```

That installs dependencies, starts Postgres, generates the Prisma client, runs
migrations and seeds demo data. Afterwards:

```bash
bun run dev
```

### Signing in

For real sign-in, create an OAuth 2.0 **Web application** client at
[Google Cloud Console](https://console.cloud.google.com/apis/credentials), set
the authorised redirect URI to `<APP_URL>/auth/google/callback`, and put the
client ID and secret in `.env`.

To work on the app before setting that up, set `DEV_AUTH_ENABLED=true` and sign
in with any email address. This is refused whenever `NODE_ENV=production`.

The seed creates `ada@example.com`, `grace@example.com` and `alan@example.com`.

## Commands

```bash
bun run dev            # watch-mode dev server
bun run check          # typecheck + tests
bun test               # tests only
bun run db:migrate:dev # create and apply a migration after a schema change
bun run db:seed        # reseed demo data (safe to re-run)
bun run db:studio      # browse the database
bun run db:reset       # drop, re-migrate, reseed
```

## What is in it

**Plans** — workspaces with their own board, backlog, sprints, whiteboards,
members and log. Roles are Owner → Admin → Member → Viewer, and invites are
share links that can optionally be pinned to one email address.

**Board** — columns with WIP limits and status categories. Drag cards between
columns; dropping into a Done column completes the item. When a sprint is
active the board shows only that sprint.

**Backlog** — one ranked list, split into sprint groups plus the unassigned
tail. Dragging a row into a sprint is how you plan it. Ranking is fractional, so
a move is a single-row update.

**Sprints** — plan, start and complete. Completing a sprint returns unfinished
items to the backlog. Burndown charts are server-rendered SVG, computed from
each item's completion time rather than a nightly snapshot.

**Whiteboards** — infinite canvas with pen, shapes, arrows, sticky notes and
text. Pan, zoom, undo/redo, autosave, and live updates for other viewers.

**Log** — every change, grouped by day, with cursor pagination.

**Home** — work assigned to you across every plan, with overdue and due-soon
counts. Press `/` anywhere to search items across all plans.

## Accessibility

The design system targets WCAG 2.1 AA. Every text/background pair in both
themes is contrast-checked at 4.5:1 or better; the lowest measured pair is
4.55:1. Colour is never the only signal — WIP breaches, item types, priorities
and due states all carry text or a label as well.

Drag-and-drop is pointer-only by nature, so every move it performs is also
reachable from the keyboard: the item dialog has Status and Sprint selects that
do the same thing.

## Security notes

- `@kitajs/html` **does not escape text children.** Every element rendering
  user-supplied text carries the `safe` attribute. `src/views/escaping.test.tsx`
  renders payloads and asserts, with a real HTML parser, that nothing
  executable survives.
- Sessions are opaque server-side rows; the cookie is httpOnly, SameSite=Lax
  and Secure in production.
- Google OAuth uses PKCE plus a state cookie, and `?next=` is restricted to
  internal paths.
- State-changing requests must carry a same-origin `Origin`/`Referer`.
- Plans you are not a member of return 404, not 403, so the endpoint does not
  confirm they exist.

## Layout

```
prisma/            schema, migration, seed
public/
  css/             design tokens, base, components, app shell, board
  js/              app, board (drag-drop), whiteboard (canvas), realtime
src/
  env.ts           validated configuration
  lib/             db, auth, access, ranking, burndown, activity, realtime
  plugins/         session and plan-scope Elysia plugins
  routes/          one module per feature area
  views/           layout, shared components, per-page views
```

## Deploying to Railway

Vercel is not a fit for this app: its functions are serverless, so the plan
WebSocket that drives live board and whiteboard updates cannot stay open.
Railway runs the Bun process directly and supports WebSockets, so nothing is
lost. `railway.json` is committed and needs no extra setup.

1. Create a Railway project from this repository. Nixpacks detects Bun from
   `bun.lock`, runs `bun install`, then `bun run build` (`prisma generate`).
2. Set these variables. `PORT` is injected by Railway — do not set it.

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `APP_URL` | your public https origin, e.g. `https://goodplaner.up.railway.app` |
   | `DATABASE_URL` | your Postgres connection string |
   | `SESSION_SECRET` | a **new** value: `openssl rand -hex 32` |
   | `GOOGLE_CLIENT_ID` | from Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |

3. Add `<APP_URL>/auth/google/callback` to the authorised redirect URIs of your
   Google OAuth client, alongside the localhost one.
4. Deploy. The start command runs `prisma migrate deploy` before booting, so
   migrations are applied on every release. `/healthz` is the health check.

The app refuses to boot rather than run misconfigured, so a failed deploy names
its own cause in the logs:

- `APP_URL` missing, or not `https://` — session cookies are `Secure` in
  production and a browser would silently drop them over http.
- No sign-in method — development sign-in is force-disabled when
  `NODE_ENV=production`, so Google credentials are mandatory there.
- `DATABASE_URL` or `SESSION_SECRET` missing.
