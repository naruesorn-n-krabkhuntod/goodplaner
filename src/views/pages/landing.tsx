import { env } from "~/env";
import { PublicShell } from "~/views/layout";
import { GoogleMark, Icon, type IconName } from "~/views/icons";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "board",
    title: "Board",
    body: "Drag work across columns with WIP limits, priorities and assignees. Everything updates live for the whole team.",
  },
  {
    icon: "backlog",
    title: "Backlog",
    body: "One ranked list feeding every sprint. Drag an item anywhere and its order holds across the board too.",
  },
  {
    icon: "sprint",
    title: "Scrum",
    body: "Plan, start and complete sprints with story points, a burndown chart and automatic carry-over.",
  },
  {
    icon: "whiteboard",
    title: "Whiteboard",
    body: "An infinite canvas for sketching: pen, shapes, arrows, sticky notes and text, saved as you draw.",
  },
  {
    icon: "log",
    title: "Activity log",
    body: "Every change recorded and grouped by day, so you can always see who moved what and when.",
  },
  {
    icon: "users",
    title: "Plans as workspaces",
    body: "Separate work from life. Each plan has its own board and members - invite people with one link.",
  },
];

export function LandingPage({ next, error }: { next?: string; error?: string }) {
  const signInHref = next ? `/auth/google?next=${encodeURIComponent(next)}` : "/auth/google";

  return (
    <PublicShell title="GoodPlanner - plan work and life in one place">
      <div class="landing">
        <nav class="landing-nav">
          <span class="row gap-2 font-semibold">
            <Icon name="sparkle" size={18} />
            GoodPlanner
          </span>
          <span class="grow" />
          <button type="button" class="btn btn-ghost btn-icon" data-theme-toggle aria-label="Toggle theme">
            <Icon name="moon" size={16} />
          </button>
        </nav>

        <main class="landing-main" id="main">
          {error ? (
            <div class="toast" data-variant="error" role="alert" style="align-self:center">
              <Icon name="alert" size={16} />
              <span safe>{error}</span>
            </div>
          ) : null}

          <h1 class="landing-title">
            Plan everything.
            <br />
            Ship the work that matters.
          </h1>

          <p class="landing-lead">
            Boards, backlogs, sprints and whiteboards in one place. Keep a plan for your team and
            another for your life, and invite whoever you want into either.
          </p>

          <div class="stack gap-3" style="align-items:center">
            {env.google.configured ? (
              <a class="btn btn-google" href={signInHref}>
                <GoogleMark size={18} />
                Continue with Google
              </a>
            ) : null}

            {env.devAuthEnabled ? (
              <form method="post" action="/auth/dev" class="stack gap-2" style="align-items:center">
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <input
                  class="input"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  aria-label="Development sign-in email"
                  style="min-width:280px"
                />
                <button type="submit" class="btn btn-secondary btn-lg">
                  Development sign-in
                </button>
                <p class="text-sm text-tertiary">
                  Local only. Set Google credentials in .env for real sign-in.
                </p>
              </form>
            ) : null}

            {!env.google.configured && !env.devAuthEnabled ? (
              <p class="text-sm text-danger">Sign-in is not configured on this server.</p>
            ) : null}
          </div>

          <div class="landing-features">
            {FEATURES.map((feature) => (
              <article class="landing-feature">
                <Icon name={feature.icon} size={18} class="icon" />
                <h2 class="landing-feature-title">{feature.title}</h2>
                <p class="landing-feature-body">{feature.body}</p>
              </article>
            ))}
          </div>
        </main>

        <footer class="landing-foot">Sign in with Google to get started.</footer>
      </div>
    </PublicShell>
  );
}

/** Shown when the OAuth round trip fails, instead of dumping the user back with no context. */
export function AuthErrorPage({ message }: { message: string }) {
  return (
    <PublicShell title="Sign-in failed - GoodPlanner">
      <div class="auth-shell">
        <div class="auth-card" role="alert">
          <div class="empty-icon" style="margin:0 auto">
            <Icon name="alert" size={22} />
          </div>
          <h1 class="card-title">Could not sign you in</h1>
          <p class="text-secondary" safe>
            {message}
          </p>
          <a class="btn btn-primary btn-block" href="/">
            Back to sign in
          </a>
        </div>
      </div>
    </PublicShell>
  );
}
