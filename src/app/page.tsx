"use client";

import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Info, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScheduleTargets } from "@/components/planner/ScheduleTargets";
import { getScheduleTargets, targetEffectiveDate } from "@/domain/scheduleTargets/scheduleTargets";
import type { NHLTeamId } from "@/domain/types";
import { DayCard } from "@/components/planner/DayCard";
import { generateDailyLineup } from "@/domain/lineup/generateDailyLineup";
import { MovePlayerPopover, type MoveTarget } from "@/components/planner/MovePlayerPopover";
import { PlanMoveDialog } from "@/components/planner/PlanMoveDialog";
import { WeekGridScroller } from "@/components/planner/WeekGridScroller";
import { WeeklyMovesPanel } from "@/components/planner/WeeklyMovesPanel";
import { AddPlayerDialog } from "@/components/roster/PlayerDialogs";
import { Button } from "@/components/ui/Button";
import { addDays, formatDayShort, formatMonthDay, startOfWeek, todayISO } from "@/domain/dates";
import { openSlotContext, openSlotEffectiveDate, type OpenSlotContext } from "@/domain/lineup/openSlot";
import { SCHEDULE_META } from "@/domain/schedule/staticProvider";
import { activeSlotCount } from "@/domain/config";
import type { DailyLineup, ISODate, PlannedTransaction, Player, TransactionType } from "@/domain/types";
import { moveProblems } from "@/domain/transactions/transactions";
import { useStore } from "@/state/store";
import { useWeekPlan } from "@/state/usePlanner";

function formatRange(weekStart: ISODate): string {
  const end = addDays(weekStart, 6);
  return `${formatMonthDay(weekStart)} – ${formatMonthDay(end)}, ${end.slice(0, 4)}`;
}

const NEXT_DAY_KEY = "shift.planner.showNextDay";

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
  const problems = useMemo(
    () =>
      moveProblems({
        baseRoster: state.roster,
        transactions: state.transactions,
        weeklyAcquisitionLimit: settings.weeklyAcquisitionLimit,
        weekStartsOn: settings.weekStartsOn,
        regularCapacity: activeSlotCount(settings.roster) + settings.roster.benchSlots,
      }),
    [state.roster, state.transactions, settings],
  );

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

  const openMove = (player: Player, day: DailyLineup, anchor: HTMLElement) =>
    setMoveTarget((t) => (t?.anchor === anchor ? null : { player, day, anchor }));
  const openSlotMenu = (day: DailyLineup, slotId: string, anchor: HTMLElement) =>
    setMoveTarget((t) => (t?.anchor === anchor ? null : { kind: "slot", slotId, day, anchor }));

  // Optional first day of next week ("Show next Monday"): planning context across the scoring boundary.
  // Never part of `plan`/`summary`, so this week's totals stay Monday–Sunday. Remembered per browser.
  const [showNextDay, setShowNextDay] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a per-browser preference after hydration
      setShowNextDay(localStorage.getItem(NEXT_DAY_KEY) === "1");
    } catch {}
  }, []);
  const toggleNextDay = (on: boolean) => {
    setShowNextDay(on);
    try {
      localStorage.setItem(NEXT_DAY_KEY, on ? "1" : "0");
    } catch {}
  };
  const nextDayDate = addDays(weekStart, 7);
  const nextDay = useMemo(() => {
    if (!showNextDay) return null;
    const { weekStart: _ws, ...rest } = input;
    void _ws;
    return generateDailyLineup({ ...rest, date: nextDayDate });
  }, [showNextDay, input, nextDayDate]);
  const gridDays = nextDay ? [...plan.days, nextDay] : plan.days;

  // Keep Add Player reachable: when the toolbar button scrolls away, a floating one appears.
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [addButtonVisible, setAddButtonVisible] = useState(true);
  useEffect(() => {
    const el = addButtonRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setAddButtonVisible(entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rosterEmpty]);

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
            <span aria-hidden className="mx-1 hidden h-8 w-px bg-line sm:block" />
            <Button ref={addButtonRef} variant="primary" onClick={() => (rosterEmpty ? setAddingPlayer(true) : openAdd(null))}>
              <UserPlus aria-hidden /> Add Player
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
          problems={problems}
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
          <section className="flex flex-col items-center justify-center self-start rounded-panel border border-dashed border-line-strong bg-surface px-6 py-20 text-center">
            <h2 className="font-display text-section-title text-ink">Your roster is empty</h2>
            <p className="mt-2 max-w-md text-body text-ink-2">
              Add your fantasy roster to generate this week&apos;s schedule. Each player&apos;s NHL team fills in their games
              automatically.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="primary" onClick={() => setAddingPlayer(true)}>
                <UserPlus aria-hidden /> Add player
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption text-ink-2">Bar = active slots filled · Green = more room to stream · Red = lineup full</p>
              <Button size="sm" onClick={() => toggleNextDay(!showNextDay)} aria-pressed={showNextDay}>
                {showNextDay ? <X aria-hidden /> : <CalendarPlus aria-hidden />}
                {showNextDay ? `Hide next ${formatDayShort(nextDayDate)}` : `Show next ${formatDayShort(nextDayDate)}`}
              </Button>
            </div>
          <WeekGridScroller>
            <div
              className={`grid gap-2 2xl:gap-3 ${nextDay ? "min-w-[1600px] grid-cols-[repeat(7,minmax(0,1fr))_auto_minmax(0,1fr)]" : "min-w-[1376px] grid-cols-7"}`}
            >
              {gridDays.map((day, i) => {
                const isNext = !!nextDay && i === 7;
                const card = (
                <DayCard
                  key={day.date}
                  day={day}
                  nextWeek={isNext}
                  isToday={day.date === today}
                  isPast={day.date < today}
                  statusRows={Math.max(0, ...gridDays.map(d => state.transactions.filter(t => t.status === "PLANNED" && t.effectiveDate === d.date).length))}
                  moveProblems={problems}
                  movesToday={state.transactions.filter((t) => t.status === "PLANNED" && t.effectiveDate === day.date)}
                  players={input.players}
                  onMovePlayer={openMove}
                  onAddToSlot={(d, position, slotId) => openAdd(openSlotContext(d.date, position, slotId))}
                  onOpenSlot={openSlotMenu}
                />
                );
                if (!isNext) return card;
                // The scoring week ends Sunday: a labelled divider keeps next week's day visibly apart.
                return [
                  <div key="week-boundary" className="flex flex-col items-center gap-2 pt-4" aria-hidden>
                    <span className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 [writing-mode:vertical-rl]">Week ends</span>
                    <span className="w-0 flex-1 border-l-2 border-dashed border-line-strong" />
                  </div>,
                  card,
                ];
              })}
            </div>
          </WeekGridScroller>
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
          allowNextWeek={showNextDay}
          slotContext={slotContext}
        />
      )}
      <AddPlayerDialog open={addingPlayer} onClose={() => setAddingPlayer(false)} />
      <MovePlayerPopover
        key={moveTarget ? `${moveTarget.day.date}-${moveTarget.kind === "slot" ? moveTarget.slotId : moveTarget.player.id}` : "none"}
        target={moveTarget}
        weekInput={input}
        onClose={() => setMoveTarget(null)}
        onAddToSlot={(d, slotId) => {
          const type = d.activeSlots.find((a) => a.slot.id === slotId)?.slot.type;
          if (type) openAdd(openSlotContext(d.date, type, slotId));
        }}
      />
      {!rosterEmpty && !addButtonVisible && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center">
          <Button variant="primary" className="pointer-events-auto shadow-popover" onClick={() => openAdd(null)}>
            <UserPlus aria-hidden /> Add Player
          </Button>
        </div>
      )}
    </div>
  );
}
