import type { Plan, Sprint } from "@prisma/client";
import type { BurndownPoint, SprintStats } from "~/lib/burndown";
import { formatDate, pluralise, toDateInput } from "~/lib/format";
import { ax } from "~/views/alpine";
import { EmptyState } from "~/views/components";
import { Icon } from "~/views/icons";

export interface SprintCardData {
  sprint: Sprint;
  stats: SprintStats;
  burndown: { points: BurndownPoint[]; total: number } | null;
}

interface SprintsProps {
  plan: Plan;
  sprints: SprintCardData[];
  canManage: boolean;
}

export function SprintsRegion({ plan, sprints, canManage }: SprintsProps) {
  const slug = plan.slug;

  return (
    <div
      class="stack gap-5"
      id="sprints"
      data-live-region
      hx-get={`/p/${slug}/sprints/fragment`}
      hx-trigger="gp:refresh"
      hx-swap="outerHTML"
    >
      {sprints.length === 0 ? (
        <EmptyState
          icon="sprint"
          title="No sprints yet"
          body="A sprint is a fixed window of work. Create one, drag items into it from the backlog, then start it."
          action={
            canManage ? (
              <button
                type="button"
                class="btn btn-primary"
                hx-post={`/p/${slug}/sprints`}
                hx-target="#sprints"
                hx-swap="outerHTML"
              >
                <Icon name="plus" size={15} />
                Create the first sprint
              </button>
            ) : null
          }
        />
      ) : (
        sprints.map((data) => <SprintCard slug={slug} data={data} canManage={canManage} />)
      )}
    </div>
  );
}

function SprintCard({
  slug,
  data,
  canManage,
}: {
  slug: string;
  data: SprintCardData;
  canManage: boolean;
}) {
  const { sprint, stats, burndown } = data;
  const base = `/p/${slug}/sprints/${sprint.id}`;

  return (
    <section class="sprint-card" data-state={sprint.state} aria-labelledby={`sprint-${sprint.id}`}>
      <header class="sprint-head">
        <div class="grow">
          <div class="row gap-2">
            <h2 class="sprint-name" id={`sprint-${sprint.id}`} safe>
              {sprint.name}
            </h2>
            {sprint.state === "ACTIVE" ? (
              <span class="badge badge-accent">Active</span>
            ) : sprint.state === "COMPLETED" ? (
              <span class="badge badge-success">Completed</span>
            ) : (
              <span class="badge">Planned</span>
            )}
          </div>

          {sprint.goal ? (
            <p class="sprint-goal" safe>
              {sprint.goal}
            </p>
          ) : null}

          {sprint.startDate && sprint.endDate ? (
            <p class="sprint-dates">
              {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
              {stats.daysRemaining !== null && sprint.state === "ACTIVE"
                ? stats.daysRemaining >= 0
                  ? ` - ${pluralise(stats.daysRemaining, "day")} left`
                  : ` - ended ${pluralise(Math.abs(stats.daysRemaining), "day")} ago`
                : ""}
            </p>
          ) : null}
        </div>

        {canManage && sprint.state !== "COMPLETED" ? (
          <div class="row gap-2">
            <SprintEditor slug={slug} sprint={sprint} />
            {sprint.state === "PLANNED" ? (
              <button
                type="button"
                class="btn btn-primary btn-sm"
                hx-post={`${base}/start`}
                hx-target="#sprints"
                hx-swap="outerHTML"
                disabled={stats.totalItems === 0}
                title={stats.totalItems === 0 ? "Add items from the backlog first" : undefined}
              >
                Start
              </button>
            ) : (
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                hx-post={`${base}/complete`}
                hx-target="#sprints"
                hx-swap="outerHTML"
                hx-confirm="Complete this sprint? Unfinished items return to the backlog."
              >
                Complete
              </button>
            )}
          </div>
        ) : null}
      </header>

      <div class="sprint-stats">
        <div class="sprint-stat">
          <div class="sprint-stat-value">
            {stats.doneItems}/{stats.totalItems}
          </div>
          <div class="sprint-stat-label">Items done</div>
        </div>
        <div class="sprint-stat">
          <div class="sprint-stat-value">
            {stats.donePoints}/{stats.totalPoints}
          </div>
          <div class="sprint-stat-label">Points burned</div>
        </div>
        <div class="sprint-stat">
          <div class="sprint-stat-value">
            {stats.totalPoints === 0
              ? "-"
              : `${Math.round((stats.donePoints / stats.totalPoints) * 100)}%`}
          </div>
          <div class="sprint-stat-label">Complete</div>
        </div>
        {stats.daysRemaining !== null ? (
          <div class="sprint-stat">
            <div class="sprint-stat-value">{Math.max(0, stats.daysRemaining)}</div>
            <div class="sprint-stat-label">Days left</div>
          </div>
        ) : null}
      </div>

      {burndown && burndown.points.length > 1 ? (
        <Burndown data={burndown} />
      ) : sprint.state === "ACTIVE" ? (
        <div class="burndown">
          <p class="text-sm text-tertiary">
            Set a start and end date on this sprint to see a burndown chart.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Inline SVG burndown. Drawn server-side so it needs no charting library and
 * survives with JavaScript disabled.
 */
function Burndown({ data }: { data: { points: BurndownPoint[]; total: number } }) {
  const width = 640;
  const height = 180;
  const padLeft = 34;
  const padBottom = 22;
  const padTop = 10;
  const padRight = 8;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const max = Math.max(1, data.total);
  const lastIndex = data.points.length - 1;

  const x = (i: number) => padLeft + (i / lastIndex) * plotW;
  const y = (value: number) => padTop + plotH - (value / max) * plotH;

  // The actual line stops at today; the rest of the window is not yet measured.
  const measured = data.points.filter((p) => !p.future);
  const actualPath = measured.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.remaining)}`).join(" ");
  const idealPath = data.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.ideal)}`).join(" ");

  const areaPath =
    measured.length > 1
      ? `${actualPath} L${x(measured.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
      : "";

  const gridValues = [0, max / 2, max];

  return (
    <div class="burndown">
      <div style="overflow-x:auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Burndown: ${measured[measured.length - 1]?.remaining ?? data.total} of ${data.total} points remaining`}
          preserveAspectRatio="xMidYMid meet"
        >
          {gridValues.map((value) => (
            <>
              <line
                class="burndown-grid"
                x1={padLeft}
                y1={y(value)}
                x2={width - padRight}
                y2={y(value)}
              />
              <text class="burndown-axis" x={padLeft - 6} y={y(value) + 3} text-anchor="end">
                {Math.round(value)}
              </text>
            </>
          ))}

          {areaPath ? <path class="burndown-area" d={areaPath} /> : null}
          <path class="burndown-ideal" d={idealPath} />
          {measured.length > 1 ? <path class="burndown-actual" d={actualPath} /> : null}

          <text class="burndown-axis" x={padLeft} y={height - 6} text-anchor="start">
            {formatDate(data.points[0]?.date ?? new Date())}
          </text>
          <text class="burndown-axis" x={width - padRight} y={height - 6} text-anchor="end">
            {formatDate(data.points[lastIndex]?.date ?? new Date())}
          </text>
        </svg>
      </div>

      <div class="burndown-legend">
        <span>
          <i class="burndown-swatch" aria-hidden="true" />
          Actual remaining
        </span>
        <span>
          <i class="burndown-swatch" data-series="ideal" aria-hidden="true" />
          Ideal pace
        </span>
      </div>
    </div>
  );
}

/** Name, goal and dates, edited in a popover so the card stays compact. */
function SprintEditor({ slug, sprint }: { slug: string; sprint: Sprint }) {
  return (
    <div class="dropdown" x-data="{ open: false }" {...ax({ "x-on:click.outside": "open = false" })}>
      <button
        type="button"
        class="btn btn-icon"
        x-on:click="open = !open"
        x-bind:aria-expanded="open"
        aria-label={`Edit ${sprint.name}`}
        data-tooltip="Edit sprint"
      >
        <Icon name="edit" size={15} />
      </button>

      <form
        class="menu dropdown-panel stack gap-3"
        data-align="right"
        style="width: 300px; padding: var(--space-4); right: 0; left: auto"
        x-show="open"
        x-cloak=""
        hx-patch={`/p/${slug}/sprints/${sprint.id}`}
        hx-target="#sprints"
        hx-swap="outerHTML"
        {...ax({ "hx-on::after-request": "if(event.detail.successful) open = false" })}
      >
        <div class="field">
          <label class="label" for={`sname-${sprint.id}`}>
            Name
          </label>
          <input
            id={`sname-${sprint.id}`}
            class="input"
            name="name"
            value={sprint.name}
            required
            maxlength="80"
          />
        </div>

        <div class="field">
          <label class="label" for={`sgoal-${sprint.id}`}>
            Goal
          </label>
          <textarea
            id={`sgoal-${sprint.id}`}
            class="textarea"
            name="goal"
            rows="2"
            maxlength="500"
            placeholder="What should this sprint achieve?"
            style="min-height:56px"
            safe
          >
            {sprint.goal ?? ""}
          </textarea>
        </div>

        <div class="row gap-2">
          <div class="field grow">
            <label class="label" for={`sstart-${sprint.id}`}>
              Start
            </label>
            <input
              id={`sstart-${sprint.id}`}
              class="input"
              type="date"
              name="startDate"
              value={toDateInput(sprint.startDate)}
            />
          </div>
          <div class="field grow">
            <label class="label" for={`send-${sprint.id}`}>
              End
            </label>
            <input
              id={`send-${sprint.id}`}
              class="input"
              type="date"
              name="endDate"
              value={toDateInput(sprint.endDate)}
            />
          </div>
        </div>

        <div class="row gap-2">
          <button type="submit" class="btn btn-primary btn-sm grow">
            Save
          </button>
          <button type="button" class="btn btn-ghost btn-sm" x-on:click="open = false">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
