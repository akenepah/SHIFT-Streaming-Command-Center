"use client";

import { Button } from "@/components/ui/Button";
import { formatDayShort, formatMonthDay, weekdayName } from "@/domain/dates";
import type { WeekSummary } from "@/domain/lineup/generateWeek";
import { acquisitionCost, acquisitionsUsed, movesForWeek } from "@/domain/transactions/transactions";
import type { ISODate, PlannedTransaction } from "@/domain/types";
import { rosterCapacity, rosterCounts } from "@/state/selectors";
import { useStore } from "@/state/store";

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
  const { settings } = state;
  const used = acquisitionsUsed(state.transactions, weekStart);
  const limit = settings.weeklyAcquisitionLimit;
  const moves = movesForWeek(state.transactions, weekStart);
  const counts = rosterCounts(state.roster);
  const capacity = rosterCapacity(settings);
  const goalieMin = settings.minGoalieAppearances;
  const goalieMet = summary.goalieStarts >= goalieMin;
  const name = (id?: string) => (id ? state.players[id]?.name ?? "Unknown player" : "");

  return (
    <aside aria-label="Weekly moves" className="flex flex-col gap-3">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[15px] font-bold">Weekly Moves</h2>
        <p className="mt-1 text-[13px]">
          <span className={`font-semibold tabular-nums ${used > limit ? "text-warn" : "text-brand"}`}>
            {used} / {limit}
          </span>{" "}
          acquisitions used
          {used > limit && <span className="font-semibold text-warn"> · over limit</span>}
        </p>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas"
          role="meter"
          aria-label="Acquisitions used"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
        >
          <div
            className={`h-full rounded-full ${used > limit ? "bg-warn" : "bg-brand"}`}
            style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-ink-3">Resets every {weekdayName(settings.weekStartsOn)}. Drops don&apos;t count.</p>
        <Button variant="primary" className="mt-3 w-full" onClick={onPlan}>
          <span aria-hidden>+</span> Plan a move
        </Button>

        <div className="mt-4">
          {moves.length === 0 ? (
            <p className="text-[12px] text-ink-3">No moves planned this week. Plan one to see its effect on each day.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {moves.map((t) => (
                <li key={t.id} className="rounded-lg border border-line p-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    <span>
                      {formatDayShort(t.effectiveDate)} {formatMonthDay(t.effectiveDate)}
                    </span>
                    <span>{acquisitionCost(t.type) ? "1 acquisition" : "No acquisition"}</span>
                  </div>
                  {t.addPlayerId && (
                    <p className="mt-1 truncate text-[13px]">
                      <span className="font-semibold text-ok">+ Add</span> {name(t.addPlayerId)}
                    </p>
                  )}
                  {t.dropPlayerId && (
                    <p className="truncate text-[13px]">
                      <span className="font-semibold text-danger">− Drop</span> {name(t.dropPlayerId)}
                    </p>
                  )}
                  <div className="mt-1.5 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(t)} aria-label="Edit planned move">
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dispatch({ type: "tx/cancel", id: t.id })}
                      aria-label="Cancel planned move"
                    >
                      Cancel move
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 text-[13px]">
        <h2 className="text-[13px] font-semibold">Current roster</h2>
        <p className="mt-1 text-ink-2 tabular-nums">
          {counts.ACTIVE} active · {counts.BENCH} bench · IR+ {counts.IR_PLUS}/{capacity.IR_PLUS}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Room for {capacity.ACTIVE + capacity.BENCH} (active + bench). Planned moves apply from their effective day.
        </p>
      </section>

      {goalieMin > 0 && (
        <section
          className={`rounded-xl border p-4 text-[13px] ${goalieMet ? "border-line bg-surface" : "border-brand/30 bg-brand-soft"}`}
        >
          <h2 className="text-[13px] font-semibold">Goalie appearances</h2>
          <p className="mt-1 tabular-nums">
            <span className="font-semibold">{summary.goalieStarts}</span> projected · minimum {goalieMin} per week
          </p>
          <p className={`mt-0.5 text-[12px] ${goalieMet ? "text-ok" : "text-brand-strong"}`}>
            {goalieMet ? "✓ Minimum met" : `Short by ${goalieMin - summary.goalieStarts}. Consider streaming a goalie.`}
          </p>
        </section>
      )}
    </aside>
  );
}
