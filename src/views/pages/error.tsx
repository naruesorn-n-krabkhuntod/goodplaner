import { Icon } from "~/views/icons";
import { PublicShell } from "~/views/layout";

const TITLES: Record<number, string> = {
  403: "You do not have access",
  404: "Page not found",
  422: "That did not look right",
  500: "Something went wrong",
};

export function ErrorPage({ status, message }: { status: number; message: string }) {
  return (
    <PublicShell title={`${status} - GoodPlanner`}>
      <div class="auth-shell">
        <div class="auth-card" role="alert">
          <div class="empty-icon" style="margin:0 auto">
            <Icon name={status === 404 ? "search" : "alert"} size={22} />
          </div>

          <h1 class="card-title">{TITLES[status] ?? "Unexpected error"}</h1>

          <p class="text-secondary" safe>
            {message}
          </p>

          <a class="btn btn-primary btn-block" href="/app">
            Back to my plans
          </a>
        </div>
      </div>
    </PublicShell>
  );
}
