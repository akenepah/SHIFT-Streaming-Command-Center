"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Info, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ScheduleTargets } from "@/components/planner/ScheduleTargets";
import { getScheduleTargets, targetEffectiveDate } from "@/domain/scheduleTargets/scheduleTargets";
import type { NHLTeamId } from "@/domain/types";
import { DayCard } from "@/components/planner/DayCard";
import { MovePlayerPopover, type MoveTarget } from "@/components/planner/MovePlayerPopover";
import { PlanMoveDialog } from "@/components/planner/PlanMoveDialog";
import { WeeklyMovesPanel } from "@/components/planner/WeeklyMovesPanel";
import { AddPlayerDialog } from "@/components/roster/PlayerDialogs";
import { Button } from "@/components/ui/Button";
import { addDays, formatDayShort, formatMonthDay, startOfWeek, todayISO } from "@/domain/dates";
import { openSlotContext, openSlotEffectiveDate, type OpenSlotContext } from "@/domain/lineup/openSlot";
import { SCHEDULE_META } from "@/domain/schedule/staticProvider";
import { activeSlotCount } from "@/domain/config";
import type { DailyLineup, ISODate, PlannedTransaction, TransactionType } from "@/domain/types";
import { useStore } from "@/state/store";
import { useWeekPlan } from "@/state/usePlanner";

function formatRange(weekStart: ISODate): string {
  const end = addDays(weekStart, 6);
  return `${formatMonthDay(weekStart)} – ${formatMonthDay(end)}, ${end.slice(0, 4)}`;
}

export default function WeeklyPlannerPage() {
  const { state } = useStore();
  const { settings } = state;
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const today = todayISO(new Date(now));
  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  const [requestedWeek, setWeekStart] = useState<string | null>(null);
  // Re-align if the league's week start day changes.
  const weekStart = startOfWeek(requestedWeek ?? thisWeek, settings.weekStartsOn);
  const { input, plan } = useWeekPlan(weekStart);

  const targets = useMemo(() => getScheduleTargets({ input, plan, today, now, timing: settings.defaultMoveTiming }), [input, plan, today, now, settings.defaultMoveTiming]);
  const [targetTeam, setTargetTeam] = useState<NHLTeamId | "">("");

  const [planOpen, setPlanOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedTransaction | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [planType, setPlanType] = useState<TransactionType>("ADD_DROP");
  /** Set when the Add flow starts from an empty active slot on a day card. */
  const [slotContext, setSlotContext] = useState<OpenSlotContext | null>(null);
  const rosterEmpty = state.roster.length === 0;

  const weekEnd = addDays(weekStart, 6);
  const defaultMoveDate = targetEffectiveDate(weekStart, settings.defaultMoveTiming, today);
  const seasonNotStarted = weekEnd < SCHEDULE_META.regularSeasonStart;
  const seasonOver = weekStart > SCHEDULE_META.regularSeasonEnd;
  const { summary } = plan;

  const openMove = (player: MoveTarget["player"], day: DailyLineup, anchor: HTMLElement) =>
    setMoveTarget((t) => (t?.anchor === anchor ? null : { player, day, anchor }));

  // Add Player on the planner is a planned move: Add when the roster has room, else Add + Drop.
  const regular = state.roster.filter((r) => r.rosterStatus !== "IR_PLUS").length;
  const addType: TransactionType = regular < activeSlotCount(settings.roster) + settings.roster.benchSlots ? "ADD" : "ADD_DROP";
  const openAdd = (context: OpenSlotContext | null) => {
    setTargetTeam("");
    setSlotContext(context);
    setPlanType(addType);
    setEditing(null);
    setPlanOpen(true);
  };

  return (
    <div>
      <a href="#week-grid" className="sr-only focus:not-sr-only focus:block focus:p-3">Skip to week grid</a>
      <div className="px-4 pt-6 sm:px-6">
        <p className="mb-1 text-overline text-ink-2">{settings.leagueName}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <h1 className="min-w-0 truncate font-display text-page-title text-ink">{settings.teamName}</h1>
          <nav aria-label="Week navigation" className="flex flex-wrap items-center gap-2">
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
            <Button variant="primary" onClick={() => (rosterEmpty ? setAddingPlayer(true) : openAdd(null))}>
              <Plus aria-hidden /> Add Player
            </Button>
          </nav>
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

      <div className="grid grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)] gap-4 px-6 pb-6 pt-5 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-4 self-start">
        <ScheduleTargets result={targets} onSelect={(team) => { openAdd(null); setTargetTeam(team); }} />
        <WeeklyMovesPanel
          weekStart={weekStart}
          summary={summary}
          onPlan={() => {
            setTargetTeam("");
            setSlotContext(null);
            setPlanType("ADD_DROP");
            setEditing(null);
            setPlanOpen(true);
          }}
          onEdit={(t) => {
            setTargetTeam("");
            setSlotContext(null);
            setEditing(t);
            setPlanOpen(true);
          }}
        />
        </div>
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
          <div className="min-w-0">
            <p className="mb-2 text-caption text-ink-2">Bar = active slots filled · Green = more room to stream · Red = lineup full</p>
            <p className="mb-2 text-caption text-ink-2 2xl:hidden">Scroll horizontally to compare all seven days →</p>
          <div id="week-grid" tabIndex={-1} className="overflow-x-auto pb-2">
            <div className="grid min-w-[1400px] grid-cols-7 gap-2 2xl:gap-3">
              {plan.days.map((day) => (
                <DayCard
                  key={day.date}
                  day={day}
                  isToday={day.date === today}
                  isPast={day.date < today}
                  statusRows={Math.max(0, ...plan.days.map(d => state.transactions.filter(t => t.status === "PLANNED" && t.effectiveDate === d.date).length))}
                  movesToday={state.transactions.filter((t) => t.status === "PLANNED" && t.effectiveDate === day.date)}
                  players={input.players}
                  onMovePlayer={openMove}
                  onAddToSlot={(d, position) => openAdd(openSlotContext(d.date, position))}
                />
              ))}
            </div>
          </div>
          </div>
        )}
      </div>

      {planOpen && (
        <PlanMoveDialog
          key={editing?.id ?? `new-${planType}-${slotContext?.date ?? ""}-${slotContext?.position ?? ""}`}
          open={planOpen}
          onClose={() => {
            setPlanOpen(false);
            setEditing(null);
          }}
          weekInput={input}
          editing={editing}
          defaultDate={slotContext ? openSlotEffectiveDate(slotContext, settings.defaultMoveTiming, today) : defaultMoveDate}
          initialType={planType}
          initialTeam={targetTeam}
          slotContext={slotContext}
        />
      )}
      <AddPlayerDialog open={addingPlayer} onClose={() => setAddingPlayer(false)} />
      <MovePlayerPopover target={moveTarget} weekInput={input} onClose={() => setMoveTarget(null)} />
    </div>
  );
}
