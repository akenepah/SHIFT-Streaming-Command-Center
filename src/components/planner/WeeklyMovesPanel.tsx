"use client";

import { AlertTriangle, CircleCheck, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDayShort, formatMonthDay, formatWeekRange, weekdayName } from "@/domain/dates";
import type { WeekSummary } from "@/domain/lineup/generateWeek";
import { acquisitionCost, acquisitionsUsed, movesForWeek } from "@/domain/transactions/transactions";
import type { ISODate, PlannedTransaction } from "@/domain/types";
import { rosterSummary } from "@/state/selectors";
import { useStore } from "@/state/store";

function Divider() {
  return <div className="-mx-4 my-4 h-px bg-line" />;
}

/** The Weekly Planner's left rail: one operational panel, sections separated by dividers. */
export function WeeklyMovesPanel({
  weekStart,
  summary,
  onPlan,
  onEdit,
}: {
  weekStart: ISODate;
  summary: WeekSummary;
  onPlan: () => void;
  onEdit: (t: PlannedTransaction) => void;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const { settings } = state;
  const used = acquisitionsUsed(state.transactions, weekStart);
  const limit = settings.weeklyAcquisitionLimit;
  const over = used > limit;
  const moves = movesForWeek(state.transactions, weekStart);
  const inventory = rosterSummary(state.roster, settings);
  const goalieMin = settings.minGoalieAppearances;
  const goalieMet = summary.goalieStarts >= goalieMin;
  const name = (id?: string) => (id ? (state.players[id]?.name ?? "Unknown player") : "");

  return (
    <aside aria-label="Weekly moves" className="self-start rounded-panel border border-line bg-surface p-4">
      <h2 className="font-display text-card-title text-ink">Weekly Moves</h2>
      <p className={`mt-3 text-body font-semibold tabular-nums ${over ? "text-warn" : "text-primary"}`}>
        {used} / {limit} weekly adds
        {over && <span className="ml-1 font-medium">· over limit</span>}
      </p>
      <p className="mt-1 text-caption text-ink-3">Resets {weekdayName(settings.weekStartsOn)} · drops don&apos;t count</p>
      <Button variant="primary" className="mt-4 w-full" onClick={onPlan}>
        <Plus aria-hidden /> Plan a move
      </Button>

      <div className="mt-4">
        {moves.length === 0 ? (
          <div className="rounded-card bg-surface-muted px-4 py-3.5">
            <p className="text-body-sm font-medium text-ink">No moves planned</p>
            <p className="mt-1.5 text-body-sm text-ink-3">Plan an add or drop by effective date to see its effect on each day.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {moves.map((t) => (
              <li key={t.id} className="rounded-card border border-line px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-overline uppercase text-ink-2">
                    {formatDayShort(t.effectiveDate)} {formatMonthDay(t.effectiveDate)}
                  </span>
                  <span className="flex">
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      aria-label="Edit planned move"
                      className="inline-flex size-7 items-center justify-center rounded-control text-ink-3 hover:bg-surface-muted hover:text-ink"
                    >
                      <Pencil aria-hidden className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: "tx/cancel", id: t.id });
                        toast("Planned move cancelled.", "info");
                      }}
                      aria-label="Cancel planned move"
                      className="inline-flex size-7 items-center justify-center rounded-control text-ink-3 hover:bg-danger-soft hover:text-danger"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </span>
                </div>
                {t.addPlayerId && (
                  <p className="mt-1 truncate text-body-sm text-ink">
                    <span className="font-semibold text-success">+</span> {name(t.addPlayerId)}
                  </p>
                )}
                {t.dropPlayerId && (
                  <p className="truncate text-body-sm text-ink">
                    <span className="font-semibold text-danger">−</span> {name(t.dropPlayerId)}
                  </p>
                )}
                <p className="mt-1 text-caption text-ink-3">{acquisitionCost(t.type) ? "Uses 1 add" : "No add used"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Divider />

      <h3 className="text-body font-semibold text-ink">Fantasy roster</h3>
      <p className="mt-1.5 text-body-sm text-ink-2 tabular-nums">
        {inventory.rostered} rostered · IR+ {inventory.irPlus} / {inventory.irPlusCapacity}
      </p>
      <p className="text-body-sm text-ink-3 tabular-nums">
        {inventory.regular} of {inventory.regularCapacity} roster spots used
      </p>
      {inventory.regular > inventory.regularCapacity && (
        <p className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-warn">
          <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
          Over by {inventory.regular - inventory.regularCapacity}. Check lineup and bench slots in League Settings.
        </p>
      )}

      {goalieMin > 0 && state.roster.length > 0 && (
        <div className="mt-4 rounded-card bg-info-soft px-3.5 py-3">
          <p className="text-body-sm font-semibold text-primary-strong">Goalie appearances</p>
          <p className="mt-1 text-body-sm text-ink tabular-nums">
            {summary.goalieStarts} projected · minimum {goalieMin}
          </p>
          <p className={`mt-1 flex items-center gap-1.5 text-caption ${goalieMet ? "text-success" : "text-ink-2"}`}>
            {goalieMet ? (
              <>
                <CircleCheck aria-hidden className="size-3.5" /> Minimum met
              </>
            ) : (
              `Short by ${goalieMin - summary.goalieStarts}. Consider streaming a goalie.`
            )}
          </p>
        </div>
      )}

      <p className="mt-4 text-caption text-ink-3">
        Players with a game fill open legal slots each day. IR+ never starts. Bundled NHL schedule ·{" "}
        {formatWeekRange(weekStart)}.
      </p>
    </aside>
  );
}
