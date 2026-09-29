"use client";

import { Armchair, ArrowLeft, ArrowLeftRight, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { matchupText } from "@/components/player/PlayerBits";
import { PositionBadge } from "@/components/ui/Badges";
import { AnchoredPopover, MenuDivider, MenuItem } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { formatDayShort, formatMonthDay } from "@/domain/dates";
import type { WeekInput } from "@/domain/lineup/generateWeek";
import { applyLineupMove, benchReplacements, ineligibleSlotTypes, moveOptions, type LineupMove } from "@/domain/lineup/moves";
import { BENCH_TARGET, type DailyLineup, type Player } from "@/domain/types";
import { useStore } from "@/state/store";

export type MoveTarget =
  | { kind?: "player"; player: Player; day: DailyLineup; anchor: HTMLElement }
  /** An open active slot: offer the benched players who can fill it. */
  | { kind: "slot"; slotId: string; day: DailyLineup; anchor: HTMLElement };

const dayLabel = (day: DailyLineup) => `${formatDayShort(day.date)} ${formatMonthDay(day.date)}`;
const slotType = (day: DailyLineup, slotId: string) => day.activeSlots.find((a) => a.slot.id === slotId)?.slot.type;

/**
 * Apply an explicit one-day lineup move with an Undo toast. Returns false (and says so) when the move
 * isn't legal; the lineup is never guessed at.
 */
export function useLineupMove(players: WeekInput["players"]) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  return (day: DailyLineup, move: LineupMove, message: string): boolean => {
    const next = applyLineupMove(state.overrides, day, players, move);
    if (!next) {
      toast("That player can't go there.", "info");
      return false;
    }
    const previous = state.overrides.filter((o) => o.date === day.date);
    dispatch({ type: "override/setDay", date: day.date, overrides: next.filter((o) => o.date === day.date) });
    toast(`${message} (${dayLabel(day)} only)`, "success", {
      label: "Undo",
      onClick: () => dispatch({ type: "override/setDay", date: day.date, overrides: previous }),
    });
    return true;
  };
}

/** Plain-language result of moving a player to an option, e.g. "Swap with Hofer · Hofer to bench". */
export function describeOption(
  players: WeekInput["players"],
  opt: { occupantId: string | null; occupantTo: string | null },
  day: DailyLineup,
): string {
  if (!opt.occupantId) return "Open slot";
  const who = players[opt.occupantId]?.name ?? "Unknown player";
  return opt.occupantTo === BENCH_TARGET ? `Swap · ${who} goes to bench` : `Swap · ${who} moves to ${slotType(day, opt.occupantTo!)}`;
}

/** One-day lineup menu anchored to a player tile or an open slot. */
export function MovePlayerPopover({
  target,
  weekInput,
  onClose,
  onAddToSlot,
}: {
  target: MoveTarget | null;
  weekInput: WeekInput;
  onClose: () => void;
  /** Open the Add Player flow for this open slot. */
  onAddToSlot?: (day: DailyLineup, slotId: string) => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const apply = useLineupMove(weekInput.players);
  const [benching, setBenching] = useState(false);
  if (!target) return null;
  const { day, anchor } = target;
  const players = weekInput.players;
  const name = (id: string) => players[id]?.name ?? "Unknown player";
  const manual = day.appliedOverrides.length > 0 || day.ignoredOverrides.length > 0;
  const done = (ok: boolean) => ok && onClose();

  const resetItem = manual && (
    <>
      <MenuDivider />
      <MenuItem
        onSelect={() => {
          dispatch({ type: "override/resetDay", date: day.date });
          toast(`${dayLabel(day)} is back to the automatic lineup.`);
          onClose();
        }}
      >
        <RotateCcw aria-hidden className="text-ink-3" /> Reset {formatDayShort(day.date)} to automatic
      </MenuItem>
    </>
  );

  if (target.kind === "slot") {
    const type = slotType(day, target.slotId);
    const candidates = benchReplacements(day, target.slotId, players);
    return (
      <AnchoredPopover anchor={anchor} onClose={onClose} label={`Fill ${type} slot`} width={272}>
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="text-body-sm font-semibold text-ink">Open {type} slot</p>
          <p className="text-caption text-ink-3">{dayLabel(day)} only</p>
        </div>
        <MenuDivider />
        <div role="menu" aria-label={`Fill the open ${type} slot`}>
          {candidates.length === 0 && <p className="px-2.5 py-2 text-caption text-ink-3">No benched player with a game can play {type} today.</p>}
          {candidates.map((id) => {
            const game = day.benchedGames.find((b) => b.playerId === id)?.game;
            return (
              <MenuItem key={id} onSelect={() => done(apply(day, { playerId: id, targetSlotId: target.slotId }, `${name(id)} starts at ${type}.`))}>
                {type && <PositionBadge kind={type} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">Start {name(id)}</span>
                  <span className="block truncate text-caption text-ink-3">From bench{game ? ` · ${matchupText(game)}` : ""}</span>
                </span>
              </MenuItem>
            );
          })}
          {onAddToSlot && (
            <>
              <MenuDivider />
              <MenuItem
                onSelect={() => {
                  onClose();
                  onAddToSlot(day, target.slotId);
                }}
              >
                <Plus aria-hidden className="text-primary-strong" /> Add a new player…
              </MenuItem>
            </>
          )}
          {resetItem}
        </div>
      </AnchoredPopover>
    );
  }

  const { player } = target;
  const current = day.activeSlots.find((a) => a.playerId === player.id);
  const game = current?.game ?? day.benchedGames.find((b) => b.playerId === player.id)?.game ?? null;
  const options = moveOptions(day, player, players);
  const notEligible = ineligibleSlotTypes(day, player);

  if (benching && current) {
    const replacements = benchReplacements(day, current.slot.id, players);
    const benchWith = (replacementId: string | null) =>
      done(
        apply(
          day,
          { playerId: player.id, targetSlotId: BENCH_TARGET, replacementId },
          replacementId ? `${player.name} to bench · ${name(replacementId)} starts at ${current.slot.type}.` : `${player.name} to bench · ${current.slot.type} left open.`,
        ),
      );
    return (
      <AnchoredPopover anchor={anchor} onClose={onClose} label={`Bench ${player.name}`} width={272}>
        <div className="px-2.5 pb-2 pt-1.5">
          <button type="button" onClick={() => setBenching(false)} className="mb-1 inline-flex items-center gap-1 rounded-control text-caption font-semibold text-primary-strong hover:underline">
            <ArrowLeft aria-hidden className="size-3.5" /> Back
          </button>
          <p className="text-body-sm font-semibold text-ink">Bench {player.name}</p>
          <p className="text-caption text-ink-3">Who takes {current.slot.type} on {dayLabel(day)}?</p>
        </div>
        <MenuDivider />
        <div role="menu" aria-label={`Replacement for ${player.name}`}>
          {replacements.map((id) => {
            const g = day.benchedGames.find((b) => b.playerId === id)?.game;
            return (
              <MenuItem key={id} onSelect={() => benchWith(id)}>
                <PositionBadge kind={current.slot.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">Start {name(id)}</span>
                  <span className="block truncate text-caption text-ink-3">From bench{g ? ` · ${matchupText(g)}` : ""}</span>
                </span>
              </MenuItem>
            );
          })}
          {replacements.length === 0 && <p className="px-2.5 py-1.5 text-caption text-ink-3">No benched player with a game can play {current.slot.type}.</p>}
          <MenuItem onSelect={() => benchWith(null)}>
            <Armchair aria-hidden className="text-ink-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">Leave {current.slot.type} open</span>
            </span>
          </MenuItem>
        </div>
      </AnchoredPopover>
    );
  }

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label={`Move ${player.name}`} width={272}>
      <div className="px-2.5 pb-2 pt-1.5">
        <p className="truncate text-body-sm font-semibold text-ink">{player.name}</p>
        <p className="text-caption text-ink-3">
          {dayLabel(day)} only{game && ` · ${matchupText(game)}`} · {current ? `in ${current.slot.type}` : "on bench"}
        </p>
      </div>
      <MenuDivider />
      <div role="menu" aria-label={`Move ${player.name} to`}>
        <p className="px-2.5 pb-1 pt-1 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">Move to…</p>
        {options.length === 0 && !current && <p className="px-2.5 py-1.5 text-caption text-ink-3">No eligible slot today.</p>}
        {options.map((o) => (
          <MenuItem
            key={o.targetSlotId}
            onSelect={() =>
              done(
                apply(
                  day,
                  { playerId: player.id, targetSlotId: o.targetSlotId },
                  o.occupantId
                    ? `${player.name} to ${o.slotType} · ${name(o.occupantId)} ${o.occupantTo === BENCH_TARGET ? "to bench" : `to ${slotType(day, o.occupantTo!)}`}.`
                    : `${player.name} to ${o.slotType}.`,
                ),
              )
            }
          >
            <PositionBadge kind={o.slotType} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{o.slotType}</span>
              <span className={`flex items-center gap-1 truncate text-caption ${o.occupantId ? "text-ink-2" : "text-success"}`}>
                {o.occupantId && <ArrowLeftRight aria-hidden className="size-3 shrink-0" />}
                {describeOption(players, o, day)}
              </span>
            </span>
          </MenuItem>
        ))}
        {current && (
          <MenuItem onSelect={() => setBenching(true)}>
            <Armchair aria-hidden className="text-ink-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">Bench</span>
              <span className="block truncate text-caption text-ink-3">Choose who replaces them next</span>
            </span>
          </MenuItem>
        )}
        {notEligible.length > 0 && (
          <p className="px-2.5 pb-1 pt-1.5 text-caption text-ink-3">Not eligible: {notEligible.join(", ")}</p>
        )}
        {resetItem}
      </div>
    </AnchoredPopover>
  );
}
