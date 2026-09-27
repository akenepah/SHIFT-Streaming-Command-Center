"use client";

import { useState } from "react";
import { DayCard } from "@/components/planner/DayCard";
import { MovePlayerDialog } from "@/components/planner/MovePlayerDialog";
import { PlanMoveDialog } from "@/components/planner/PlanMoveDialog";
import { WeeklyMovesPanel } from "@/components/planner/WeeklyMovesPanel";
import { Button } from "@/components/ui/Button";
import { addDays, formatDayShort, formatMonthDay, formatWeekRange, startOfWeek, todayISO } from "@/domain/dates";
import { SCHEDULE_META } from "@/domain/schedule/staticProvider";
import type { DailyLineup, PlannedTransaction, Player } from "@/domain/types";
import { useStore } from "@/state/store";
import { useWeekPlan } from "@/state/usePlanner";

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

export default function WeeklyPlannerPage() {
  const { state } = useStore();
  const today = todayISO();
  const thisWeek = startOfWeek(today, state.settings.weekStartsOn);
  const [requestedWeek, setWeekStart] = useState<string | null>(null);
  // Re-align if the league's week start day changes.
  const weekStart = startOfWeek(requestedWeek ?? thisWeek, state.settings.weekStartsOn);
  const { input, plan } = useWeekPlan(weekStart);

  const [planOpen, setPlanOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedTransaction | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ player: Player; day: DailyLineup } | null>(null);

  const weekEnd = addDays(weekStart, 6);
  const defaultMoveDate = today >= weekStart && today <= weekEnd ? today : weekStart;
  const maxGames = Math.max(1, ...plan.days.map((d) => d.nhlGameCount));
  const seasonNotStarted = weekEnd < SCHEDULE_META.regularSeasonStart;
  const seasonOver = weekStart > SCHEDULE_META.regularSeasonEnd;
  const { summary } = plan;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">{state.settings.teamName}</h1>
          <p className="mt-0.5 text-ink-2">
            {state.settings.leagueName} · {state.settings.season} · NHL schedule bundled with the app
          </p>
        </div>
        <nav aria-label="Week navigation" className="flex items-center gap-2">
          <Button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            <span aria-hidden>‹</span> Prev
          </Button>
          <Button onClick={() => setWeekStart(thisWeek)} disabled={weekStart === thisWeek}>
            This Week
          </Button>
          <Button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            Next <span aria-hidden>›</span>
          </Button>
          <span className="ml-2 min-w-40 text-[15px] font-semibold tabular-nums" aria-live="polite">
            {formatWeekRange(weekStart)}
            {weekStart === thisWeek && <span className="ml-1.5 text-[12px] font-medium text-brand">This week</span>}
          </span>
        </nav>
      </div>

      {(seasonNotStarted || seasonOver) && (
        <p className="mb-4 rounded-lg border border-brand/30 bg-brand-soft px-4 py-2.5 text-[13px] text-brand-strong">
          {seasonNotStarted
            ? `The 2026–27 regular season starts ${formatDayShort(SCHEDULE_META.regularSeasonStart)} ${formatMonthDay(SCHEDULE_META.regularSeasonStart)}. Use Next to jump ahead.`
            : "The 2026–27 regular season is over."}{" "}
          {seasonNotStarted && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setWeekStart(startOfWeek(SCHEDULE_META.regularSeasonStart, state.settings.weekStartsOn))}
            >
              Go to opening week
            </button>
          )}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-stretch gap-4">
        <div className="flex-1 rounded-xl border border-line bg-surface px-4 py-3">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">NHL games this week</h2>
          <ol className="grid grid-cols-7 gap-2">
            {plan.days.map((d) => {
              const heavy = d.nhlGameCount >= Math.max(8, maxGames * 0.75);
              const light = d.nhlGameCount > 0 && d.nhlGameCount <= 4;
              return (
                <li key={d.date} className="text-center">
                  <div className="text-[11px] font-medium text-ink-3">
                    {formatDayShort(d.date)}
                    {d.date === today && <span className="text-brand"> ·</span>}
                  </div>
                  <div className="mx-auto mt-1 flex h-10 items-end justify-center" aria-hidden>
                    <div
                      className={`w-6 rounded-t ${heavy ? "bg-nav" : light ? "bg-brand/40" : "bg-brand/70"}`}
                      style={{ height: `${Math.max(3, (d.nhlGameCount / maxGames) * 40)}px` }}
                    />
                  </div>
                  <div className="mt-1 text-[13px] font-bold tabular-nums">
                    {d.nhlGameCount}
                    <span className="sr-only"> NHL games on {formatDayShort(d.date)}</span>
                  </div>
                  <div className="text-[10px] text-ink-3">{heavy ? "Heavy" : light ? "Light" : d.nhlGameCount ? "" : "Off"}</div>
                </li>
              );
            })}
          </ol>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[520px]">
          <Stat label="Games started" value={summary.gamesStarted} />
          <Stat label="Benched games" value={summary.benchedGames} tone={summary.benchedGames ? "warn" : "default"} />
          <Stat label="Open slot-days" value={summary.openSlotDays} />
          <Stat label="NHL games" value={summary.nhlGames} />
        </dl>
      </div>

      <div className="grid grid-cols-[236px_minmax(0,1fr)] gap-4 2xl:grid-cols-[280px_minmax(0,1fr)]">
        <WeeklyMovesPanel
          weekStart={weekStart}
          summary={summary}
          onPlan={() => {
            setEditing(null);
            setPlanOpen(true);
          }}
          onEdit={(t) => {
            setEditing(t);
            setPlanOpen(true);
          }}
        />
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[900px] grid-cols-7 gap-2">
            {plan.days.map((day) => (
              <DayCard
                key={day.date}
                day={day}
                isToday={day.date === today}
                isPast={day.date < today}
                movesToday={state.transactions.filter((t) => t.status === "PLANNED" && t.effectiveDate === day.date)}
                onMovePlayer={(player, d) => setMoveTarget({ player, day: d })}
              />
            ))}
          </div>
        </div>
      </div>

      {planOpen && (
        <PlanMoveDialog
          key={editing?.id ?? "new"}
          open={planOpen}
          onClose={() => {
            setPlanOpen(false);
            setEditing(null);
          }}
          weekInput={input}
          editing={editing}
          defaultDate={defaultMoveDate}
        />
      )}
      <MovePlayerDialog target={moveTarget} weekInput={input} onClose={() => setMoveTarget(null)} />
    </div>
  );
}
