"use client";

import { Armchair, RotateCcw, Undo2 } from "lucide-react";
import { matchupText } from "@/components/player/PlayerBits";
import { PositionBadge } from "@/components/ui/Badges";
import { AnchoredPopover, MenuDivider, MenuItem } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { formatDayShort, formatMonthDay } from "@/domain/dates";
import type { WeekInput } from "@/domain/lineup/generateWeek";
import { legalTargets, overrideOutcome } from "@/domain/lineup/overrides";
import { BENCH_TARGET, type DailyLineup, type Player } from "@/domain/types";
import { useStore } from "@/state/store";

export type MoveTarget = { player: Player; day: DailyLineup; anchor: HTMLElement };

/** Compact one-day lineup popover anchored to the selected player tile. */
export function MovePlayerPopover({
  target,
  weekInput,
  onClose,
}: {
  target: MoveTarget | null;
  weekInput: WeekInput;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  if (!target) return null;
  const { player, day, anchor } = target;
  const targets = legalTargets(day, player);
  const current = day.activeSlots.find((a) => a.playerId === player.id);
  const game = current?.game ?? day.benchedGames.find((b) => b.playerId === player.id)?.game ?? null;
  const existing = state.overrides.find((o) => o.date === day.date && o.playerId === player.id);
  const dayHasOverrides = day.appliedOverrides.length > 0 || day.ignoredOverrides.length > 0;
  const dateLabel = `${formatDayShort(day.date)} ${formatMonthDay(day.date)}`;

  const delta = (targetSlotId: string) => {
    const outcome = overrideOutcome(weekInput, day, state.overrides, { date: day.date, playerId: player.id, targetSlotId });
    return { delta: outcome.delta, displaced: outcome.displaced.map((id) => weekInput.players[id]?.name ?? "Unknown player") };
  };

  const choose = (targetSlotId: string) => {
    dispatch({ type: "override/set", override: { date: day.date, playerId: player.id, targetSlotId } });
    toast(`${player.name}: lineup changed for ${dateLabel}.`);
    onClose();
  };

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label={`Move ${player.name}`} width={248}>
      <div className="px-2.5 pb-2 pt-1.5">
        <p className="truncate text-body-sm font-semibold text-ink">{player.name}</p>
        <p className="text-caption text-ink-3">
          {dateLabel} only{game && ` · ${matchupText(game)}`} · {current ? `in ${current.slot.type}` : "benched"}
        </p>
      </div>
      <MenuDivider />
      <div role="menu" aria-label={`Lineup options for ${player.name}`}>
        {targets.length === 0 && <p className="px-2.5 py-2 text-caption text-ink-3">No other legal spot today.</p>}
        {targets.map((t) => {
          const result = delta(t.targetSlotId);
          const d = result.delta;
          const bench = t.targetSlotId === BENCH_TARGET;
          const type = day.activeSlots.find((a) => a.slot.id === t.targetSlotId)?.slot.type;
          const effect =
            d !== 0
              ? `${d > 0 ? "+" : ""}${d} ${Math.abs(d) === 1 ? "start" : "starts"}`
              : result.displaced.length
                ? `Replaces ${result.displaced.join(", ")}`
                : bench
                  ? "No change in starts"
                  : "Rebalances lineup";
          return (
            <MenuItem key={t.targetSlotId} onSelect={() => choose(t.targetSlotId)}>
              {bench ? <Armchair aria-hidden className="text-ink-3" /> : type && <PositionBadge kind={type} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{bench ? "Sit on bench" : `Move to ${t.label}`}</span>
                <span className={`block truncate text-caption ${d < 0 ? "text-warn" : d > 0 ? "text-success" : "text-ink-3"}`}>
                  {effect}
                </span>
              </span>
            </MenuItem>
          );
        })}
        {(existing || dayHasOverrides) && <MenuDivider />}
        {existing && (
          <MenuItem
            onSelect={() => {
              dispatch({ type: "override/remove", date: day.date, playerId: player.id });
              onClose();
            }}
          >
            <Undo2 aria-hidden className="text-ink-3" /> Return to automatic
          </MenuItem>
        )}
        {dayHasOverrides && (
          <MenuItem
            onSelect={() => {
              dispatch({ type: "override/resetDay", date: day.date });
              toast(`${dateLabel} reset to the automatic lineup.`);
              onClose();
            }}
          >
            <RotateCcw aria-hidden className="text-ink-3" /> Reset day
          </MenuItem>
        )}
      </div>
    </AnchoredPopover>
  );
}
