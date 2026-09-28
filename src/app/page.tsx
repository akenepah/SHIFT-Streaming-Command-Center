"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Info, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DayCard } from "@/components/planner/DayCard";
import { MovePlayerPopover, type MoveTarget } from "@/components/planner/MovePlayerPopover";
import { PlanMoveDialog } from "@/components/planner/PlanMoveDialog";
import { WeeklyMovesPanel } from "@/components/planner/WeeklyMovesPanel";
import { AddPlayerDialog } from "@/components/roster/PlayerDialogs";
import { Button } from "@/components/ui/Button";
import { addDays, formatDayLong, formatDayShort, formatMonthDay, startOfWeek, todayISO } from "@/domain/dates";
import { SCHEDULE_META } from "@/domain/schedule/staticProvider";
import { activeSlotCount } from "@/domain/config";
import type { DailyLineup, ISODate, PlannedTransaction, TransactionType } from "@/domain/types";
import { useStore } from "@/state/store";
import { useWeekPlan } from "@/state/usePlanner";

/** Density tiers for the NHL games strip. Counts always come from the schedule. */
function densityClass(count: number, max: number): string {
  if (count === 0) return "border border-line bg-surface-muted text-ink-3";
  if (count === max && count >= 12) return "border border-accent-line bg-accent-soft font-medium text-accent-strong";
  if (count >= 8) return "bg-nav text-nav-ink";
  return "border border-line bg-surface-muted text-ink-2";
}

function densityLabel(count: number, max: number): string {
  if (count === 0) return "no games";
  if (count === max && count >= 12) return "heaviest night";
  if (count >= 8) return "heavy";
  return "light";
}

function formatRange(weekStart: ISODate): string {
  const end = addDays(weekStart, 6);
  return `${formatMonthDay(weekStart)} – ${formatMonthDay(end)}, ${end.slice(0, 4)}`;
}

export default function WeeklyPlannerPage() {
  const { state } = useStore();
  const { settings } = state;
  const today = todayISO();
  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  const [requestedWeek, setWeekStart] = useState<string | null>(null);
  // Re-align if the league's week start day changes.
  const weekStart = startOfWeek(requestedWeek ?? thisWeek, settings.weekStartsOn);
  const { input, plan } = useWeekPlan(weekStart);

  const [planOpen, setPlanOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedTransaction | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [planType, setPlanType] = useState<TransactionType>("ADD_DROP");
  const rosterEmpty = state.roster.length === 0;

  const weekEnd = addDays(weekStart, 6);
  const preferred = settings.defaultMoveTiming === "TODAY" ? today : addDays(today, 1);
  const defaultMoveDate = preferred >= weekStart && preferred <= weekEnd ? preferred : weekStart;
  const maxGames = Math.max(0, ...plan.days.map((d) => d.nhlGameCount));
  const seasonNotStarted = weekEnd < SCHEDULE_META.regularSeasonStart;
  const seasonOver = weekStart > SCHEDULE_META.regularSeasonEnd;
  const { summary } = plan;

  const openMove = (player: MoveTarget["player"], day: DailyLineup, anchor: HTMLElement) =>
    setMoveTarget((t) => (t?.anchor === anchor ? null : { player, day, anchor }));

  return (
    <div>
      <div className="border-b border-line bg-surface px-6 pb-6 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-display text-page-title text-ink">{settings.teamName}</h1>
            <p className="mt-2 text-body text-ink-2">
              {settings.leagueName} · {settings.season.replace("-", "–")} · Bundled NHL schedule
            </p>
          </div>
          <nav aria-label="Week navigation" className="flex items-center gap-3">
            <Button size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft aria-hidden />
            </Button>
            <div
              aria-live="polite"
              className="flex h-11 min-w-52 items-center justify-center rounded-control border border-line bg-surface px-5 text-body font-semibold tabular-nums text-ink"
            >
              {formatRange(weekStart)}
            </div>
            <Button size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight aria-hidden />
            </Button>
            <Button onClick={() => setWeekStart(thisWeek)} aria-pressed={weekStart === thisWeek}>
              This Week
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                // On the planner, adding a player is a planned move: Add when the roster has room, else Add + Drop.
                if (rosterEmpty) {
                  setAddingPlayer(true);
                  return;
                }
                const regular = state.roster.filter((r) => r.rosterStatus !== "IR_PLUS").length;
                setPlanType(regular < activeSlotCount(settings.roster) + settings.roster.benchSlots ? "ADD" : "ADD_DROP");
                setEditing(null);
                setPlanOpen(true);
              }}
            >
              <Plus aria-hidden /> Add Player
            </Button>
          </nav>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-body text-ink-2">NHL games this week</h2>
            <ol className="flex gap-2">
              {plan.days.map((d) => (
                <li
                  key={d.date}
                  className={`flex h-7 min-w-20 items-center justify-center gap-2 rounded-control px-3 text-caption tabular-nums ${densityClass(
                    d.nhlGameCount,
                    maxGames,
                  )} ${d.date === today ? "ring-2 ring-focus ring-offset-1" : ""}`}
                  title={`${formatDayLong(d.date)}: ${d.nhlGameCount} NHL games (${densityLabel(d.nhlGameCount, maxGames)})`}
                >
                  <span>{formatDayShort(d.date)}</span>
                  <span className="font-semibold">{d.nhlGameCount}</span>
                  <span className="sr-only">
                    NHL games, {densityLabel(d.nhlGameCount, maxGames)}
                    {d.date === today ? ", today" : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {!rosterEmpty && (
            <p className="ml-auto text-body-sm text-ink-2 tabular-nums">
              <span className="font-semibold text-ink">{summary.gamesStarted}</span> games started ·{" "}
              <span className={summary.benchedGames ? "font-semibold text-warn" : ""}>{summary.benchedGames} benched</span> ·{" "}
              {summary.openSlotDays} open slot-days
            </p>
          )}
        </div>

        {(seasonNotStarted || seasonOver) && (
          <p className="mt-4 flex items-center gap-2 text-body-sm text-primary-strong">
            <Info aria-hidden className="size-4" />
            {seasonNotStarted
              ? `The 2026–27 regular season starts ${formatDayShort(SCHEDULE_META.regularSeasonStart)} ${formatMonthDay(SCHEDULE_META.regularSeasonStart)}.`
              : "The 2026–27 regular season is over."}
            {seasonNotStarted && (
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => setWeekStart(startOfWeek(SCHEDULE_META.regularSeasonStart, settings.weekStartsOn))}
              >
                Go to opening week
              </button>
            )}
          </p>
        )}
        {state.needsRepair.length > 0 && (
          <p role="alert" className="mt-4 flex items-center gap-2 text-body-sm text-warn-strong">
            <AlertTriangle aria-hidden className="size-4" />
            {state.needsRepair.length === 1
              ? "1 saved player couldn't be loaded and is left out of the plan."
              : `${state.needsRepair.length} saved players couldn't be loaded and are left out of the plan.`}
            <Link href="/roster" className="font-semibold underline underline-offset-2">
              Fix on the Roster screen
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-[224px_minmax(0,1fr)] gap-4 px-6 py-6 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <WeeklyMovesPanel
          weekStart={weekStart}
          summary={summary}
          onPlan={() => {
            setPlanType("ADD_DROP");
            setEditing(null);
            setPlanOpen(true);
          }}
          onEdit={(t) => {
            setEditing(t);
            setPlanOpen(true);
          }}
        />
        {rosterEmpty ? (
          <section className="flex flex-col items-center justify-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-20 text-center">
            <h2 className="font-display text-section-title text-ink">Your roster is empty</h2>
            <p className="mt-2 max-w-md text-body text-ink-2">
              Add your fantasy roster to generate this week&apos;s schedule. Each player&apos;s NHL team fills in their games
              automatically.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="primary" onClick={() => setAddingPlayer(true)}>
                <Plus aria-hidden /> Add player
              </Button>
              <Link
                href="/roster"
                className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 text-body font-semibold text-ink hover:border-line-strong hover:bg-surface-muted"
              >
                Go to Roster
              </Link>
            </div>
          </section>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1000px] grid-cols-7 gap-2 2xl:gap-3">
              {plan.days.map((day) => (
                <DayCard
                  key={day.date}
                  day={day}
                  isToday={day.date === today}
                  isPast={day.date < today}
                  movesToday={state.transactions.filter((t) => t.status === "PLANNED" && t.effectiveDate === day.date)}
                  onMovePlayer={openMove}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {planOpen && (
        <PlanMoveDialog
          key={editing?.id ?? `new-${planType}`}
          open={planOpen}
          onClose={() => {
            setPlanOpen(false);
            setEditing(null);
          }}
          weekInput={input}
          editing={editing}
          defaultDate={defaultMoveDate}
          initialType={planType}
        />
      )}
      <AddPlayerDialog open={addingPlayer} onClose={() => setAddingPlayer(false)} />
      <MovePlayerPopover target={moveTarget} weekInput={input} onClose={() => setMoveTarget(null)} />
    </div>
  );
}
