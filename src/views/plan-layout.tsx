import type { Children } from "@kitajs/html";
import type { Plan } from "@prisma/client";
import { AppShell, type PlanSummary, PlanTabs, type PlanTab, type ShellUser, Topbar } from "~/views/layout";

interface PlanLayoutProps {
  user: ShellUser;
  plans: PlanSummary[];
  plan: Plan;
  tab: PlanTab;
  /** Extra breadcrumb after the plan name, e.g. a whiteboard title. */
  trail?: string;
  actions?: Children;
  /** The page manages its own scrolling (board, whiteboard). */
  fixed?: boolean;
  children?: Children;
}

/**
 * Chrome shared by every view inside a plan: shell, breadcrumbs, tab strip.
 * `data-plan-id` is what realtime.js uses to open the plan WebSocket.
 */
export function PlanLayout({
  user,
  plans,
  plan,
  tab,
  trail,
  actions,
  fixed,
  children,
}: PlanLayoutProps) {
  const tabLabel = tab.charAt(0).toUpperCase() + tab.slice(1);

  return (
    <AppShell
      title={`${trail ?? tabLabel} - ${plan.name} - GoodPlanner`}
      user={user}
      plans={plans}
      activePlan={plan.slug}
    >
      <Topbar
        crumbs={[
          { label: plan.name, emoji: plan.emoji, href: `/p/${plan.slug}/board` },
          { label: trail ?? tabLabel },
        ]}
        actions={actions}
      />
      <PlanTabs slug={plan.slug} active={tab} />

      <div
        class={fixed ? "page-fixed" : "page"}
        data-plan-id={plan.id}
        style={fixed ? "" : undefined}
      >
        {children}
      </div>

      {/* Host for dialogs opened by htmx. */}
      <div id="modal" />

      <script src="/js/realtime.js" type="module" defer />
      <script src="/vendor/sortable.min.js" defer />
      <script src="/js/board.js" type="module" defer />
    </AppShell>
  );
}
