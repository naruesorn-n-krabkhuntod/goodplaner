import type { Children } from "@kitajs/html";
import type { Plan, User } from "@prisma/client";
import { ax } from "~/views/alpine";
import { Avatar } from "~/views/components";
import { Icon, type IconName } from "~/views/icons";

/** Applied before first paint so a dark-mode reload never flashes white. */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('gp-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}})()`;

interface DocumentProps {
  title: string;
  children?: Children;
  bodyClass?: string;
}

/** Base HTML document. Everything else renders inside this. */
export function Document({ title, children, bodyClass }: DocumentProps) {
  return (
    <>
      {"<!doctype html>"}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <title safe>{title}</title>
          <meta name="color-scheme" content="light dark" />
          <meta
            name="description"
            content="GoodPlanner - boards, backlogs, sprints and whiteboards for work and life."
          />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

          <link rel="stylesheet" href="/css/tokens.css" />
          <link rel="stylesheet" href="/css/base.css" />
          <link rel="stylesheet" href="/css/components.css" />
          <link rel="stylesheet" href="/css/app.css" />
          <link rel="stylesheet" href="/css/board.css" />

          <script>{THEME_BOOTSTRAP}</script>

          <script src="/vendor/htmx.min.js" defer />
          <script src="/vendor/alpine.min.js" defer />
          <script src="/js/app.js" type="module" defer />
        </head>
        <body class={bodyClass}>
          {children}
          {/* Live region for toasts; fragments swap into it out of band. */}
          <div id="toasts" class="toast-region" aria-live="polite" aria-atomic="false" />
        </body>
      </html>
    </>
  );
}

// ============================ Signed-in shell ==============================

export interface ShellUser extends Pick<User, "id" | "name" | "email" | "avatarUrl"> {}

export type PlanSummary = Pick<Plan, "id" | "slug" | "name" | "emoji">;

interface AppShellProps {
  title: string;
  user: ShellUser;
  plans: PlanSummary[];
  /** Slug of the plan currently open, if any. */
  activePlan?: string;
  /** Key of the active top-level nav entry. */
  activeNav?: "home" | "plans";
  children?: Children;
}

export function AppShell({
  title,
  user,
  plans,
  activePlan,
  activeNav,
  children,
}: AppShellProps) {
  return (
    <Document title={title}>
      <a class="skip-link" href="#main">
        Skip to content
      </a>

      <div class="app" x-data="{ sidebar: false }" x-bind:data-sidebar="sidebar ? 'open' : 'closed'">
        <aside class="sidebar" aria-label="Primary">
          <div class="sidebar-head">
            <a class="sidebar-brand" href="/app">
              <Icon name="sparkle" size={16} />
              <span class="truncate">GoodPlanner</span>
            </a>
            <button
              type="button"
              class="btn btn-icon sidebar-toggle"
              x-on:click="sidebar = false"
              aria-label="Close menu"
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div class="sidebar-scroll">
            <nav class="sidebar-section" aria-label="Overview">
              <NavItem
                href="/app"
                icon="home"
                label="Home"
                current={activeNav === "home" && !activePlan}
              />
              <button
                type="button"
                class="nav-item"
                style="width:100%"
                x-on:click="$dispatch('open-search')"
              >
                <Icon name="search" size={16} class="icon" />
                <span>Search</span>
                <kbd class="nav-count">/</kbd>
              </button>
              <NavItem
                href="/app/plans"
                icon="archive"
                label="All plans"
                current={activeNav === "plans"}
              />
            </nav>

            <div class="sidebar-section">
              <div class="sidebar-section-head">
                <span class="sidebar-section-title">PLANS</span>
                <a
                  class="btn btn-icon"
                  href="/app/plans/new"
                  aria-label="Create a plan"
                  data-tooltip="New plan"
                >
                  <Icon name="plus" size={14} />
                </a>
              </div>

              <nav aria-label="Plans">
                {plans.length === 0 ? (
                  <p class="text-sm text-tertiary" style="padding: var(--space-2)">
                    No plans yet.
                  </p>
                ) : (
                  plans.map((plan) => (
                    <a
                      class="nav-item"
                      href={`/p/${plan.slug}/board`}
                      aria-current={plan.slug === activePlan ? "page" : undefined}
                    >
                      <span class="nav-item-emoji" aria-hidden="true" safe>
                        {plan.emoji}
                      </span>
                      <span class="truncate" safe>
                        {plan.name}
                      </span>
                    </a>
                  ))
                )}
              </nav>
            </div>
          </div>

          <div class="sidebar-foot">
            <div class="dropdown" x-data="{ open: false }" {...ax({ "x-on:click.outside": "open = false" })}>
              <button
                type="button"
                class="user-button"
                x-on:click="open = !open"
                x-bind:aria-expanded="open"
                aria-haspopup="menu"
              >
                <Avatar user={user} size="lg" />
                <span class="grow stack" style="gap:0">
                  <span class="truncate font-medium" safe>
                    {user.name}
                  </span>
                  <span class="truncate text-xs text-tertiary" safe>
                    {user.email}
                  </span>
                </span>
                <Icon name="chevronUp" size={14} />
              </button>

              <div
                class="menu dropdown-panel"
                style="bottom: calc(100% + var(--space-1)); top: auto; width: 100%"
                x-show="open"
                x-cloak=""
                x-transition=""
                role="menu"
              >
                <button type="button" class="menu-item" role="menuitem" data-theme-toggle>
                  <Icon name="moon" size={15} />
                  <span>Toggle theme</span>
                </button>
                <div class="menu-separator" />
                <form method="post" action="/auth/logout">
                  <button type="submit" class="menu-item menu-item-danger" role="menuitem">
                    <Icon name="logout" size={15} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </aside>

        <main class="main" id="main">
          {children}
        </main>
      </div>

      <SearchDialog />
    </Document>
  );
}

function NavItem({
  href,
  icon,
  label,
  current,
}: {
  href: string;
  icon: IconName;
  label: string;
  current?: boolean;
}) {
  return (
    <a class="nav-item" href={href} aria-current={current ? "page" : undefined}>
      <Icon name={icon} size={16} class="icon" />
      <span>{label}</span>
    </a>
  );
}

// ================================ Topbar ===================================

export interface Crumb {
  label: string;
  href?: string;
  emoji?: string;
}

export function Topbar({ crumbs, actions }: { crumbs: Crumb[]; actions?: Children }) {
  return (
    <header class="topbar">
      <button
        type="button"
        class="btn btn-icon sidebar-toggle"
        x-on:click="sidebar = true"
        aria-label="Open menu"
      >
        <Icon name="menu" size={18} />
      </button>

      <nav class="crumbs" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const content = (
            <>
              {crumb.emoji ? (
                <span aria-hidden="true" style="margin-right:4px" safe>
                  {crumb.emoji}
                </span>
              ) : null}
              <span safe>{crumb.label}</span>
            </>
          );

          return (
            <>
              {index > 0 ? (
                <span class="crumb-sep" aria-hidden="true">
                  /
                </span>
              ) : null}
              {crumb.href && !isLast ? (
                <a class="crumb truncate" href={crumb.href}>
                  {content}
                </a>
              ) : (
                <span class="crumb crumb-current truncate" aria-current={isLast ? "page" : undefined}>
                  {content}
                </span>
              )}
            </>
          );
        })}
      </nav>

      {actions ? <div class="topbar-actions">{actions}</div> : null}
    </header>
  );
}

// ============================== Plan tab strip =============================

export type PlanTab = "board" | "backlog" | "sprints" | "whiteboards" | "log" | "members";

const PLAN_TABS: { key: PlanTab; label: string; icon: IconName; path: string }[] = [
  { key: "board", label: "Board", icon: "board", path: "board" },
  { key: "backlog", label: "Backlog", icon: "backlog", path: "backlog" },
  { key: "sprints", label: "Sprints", icon: "sprint", path: "sprints" },
  { key: "whiteboards", label: "Whiteboards", icon: "whiteboard", path: "whiteboards" },
  { key: "log", label: "Log", icon: "log", path: "log" },
  { key: "members", label: "Members", icon: "users", path: "members" },
];

export function PlanTabs({ slug, active }: { slug: string; active: PlanTab }) {
  return (
    <nav class="tabs" aria-label="Plan views">
      {PLAN_TABS.map((tab) => (
        <a
          class="tab"
          href={`/p/${slug}/${tab.path}`}
          aria-current={tab.key === active ? "page" : undefined}
        >
          <Icon name={tab.icon} size={15} />
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}

// ============================== Search dialog ==============================

/** Opened with "/" or the sidebar entry; results are fetched by htmx as you type. */
function SearchDialog() {
  return (
    <div
      x-data="{ open: false }"
      {...ax({
        "x-on:open-search.window": "open = true; $nextTick(() => $refs.q?.focus())",
        "x-on:keydown.escape.window": "open = false",
        "x-on:close-modal.window": "open = false",
      })}
    >
      <div
        class="modal-backdrop"
        x-show="open"
        x-cloak=""
        {...ax({ "x-on:click.self": "open = false" })}
      >
        <div class="modal" role="dialog" aria-modal="true" aria-label="Search work items">
          <div class="modal-header">
            <Icon name="search" size={16} />
            <input
              type="search"
              class="input-seamless grow"
              placeholder="Search items across all plans..."
              x-ref="q"
              name="q"
              autocomplete="off"
              hx-get="/app/search"
              hx-trigger="input changed delay:180ms, search"
              hx-target="#search-results"
              aria-label="Search work items"
            />
            <kbd class="badge">Esc</kbd>
          </div>
          <div id="search-results" class="modal-body" style="padding: var(--space-2); min-height: 120px">
            <p class="text-sm text-tertiary" style="padding: var(--space-3)">
              Type to search by title or key.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================== Public shell ===============================

export function PublicShell({ title, children }: { title: string; children?: Children }) {
  return (
    <Document title={title}>
      {children}
    </Document>
  );
}
