import { canPlaySlot } from "../config";
import { BENCH_TARGET, type DailyLineup, type DailyLineupOverride, type ISODate, type Player, type Slot } from "../types";

/** Set (or replace) a player's override for one date. */
export function setOverride(
  overrides: readonly DailyLineupOverride[],
  next: DailyLineupOverride,
): DailyLineupOverride[] {
  return [...overrides.filter((o) => !(o.date === next.date && o.playerId === next.playerId)), next];
}

export function removeOverride(
  overrides: readonly DailyLineupOverride[],
  date: ISODate,
  playerId: string,
): DailyLineupOverride[] {
  return overrides.filter((o) => !(o.date === date && o.playerId === playerId));
}

/** "Reset day lineup": drop every override for the date. */
export function resetDay(overrides: readonly DailyLineupOverride[], date: ISODate): DailyLineupOverride[] {
  return overrides.filter((o) => o.date !== date);
}

export type OverrideTarget = {
  targetSlotId: string;
  label: string;
  /** Who currently holds the slot, if anyone. They'll be re-placed by the engine. */
  occupantId: string | null;
};

/**
 * Where a playing player can legally be moved on this day: any active slot
 * their positions allow (other than the one they're in), or the bench.
 */
export function legalTargets(day: DailyLineup, player: Player): OverrideTarget[] {
  const playing =
    day.activeSlots.some((a) => a.playerId === player.id) || day.benchedGames.some((b) => b.playerId === player.id);
  if (!playing) return [];

  const current = day.activeSlots.find((a) => a.playerId === player.id)?.slot.id;
  const eligible = day.activeSlots.filter((a) => a.slot.id !== current && canPlaySlot(player.eligiblePositions, a.slot.type));
  // One entry per slot type when an open slot exists; otherwise one per occupant to replace.
  const openTypes = new Set<string>();
  const targets: OverrideTarget[] = [];
  for (const a of eligible) {
    const hasOpen = eligible.some((b) => b.slot.type === a.slot.type && b.playerId === null);
    if (hasOpen) {
      if (a.playerId !== null || openTypes.has(a.slot.type)) continue;
      openTypes.add(a.slot.type);
    }
    targets.push({ targetSlotId: a.slot.id, label: slotLabel(a.slot), occupantId: a.playerId });
  }
  if (current) targets.push({ targetSlotId: BENCH_TARGET, label: "Bench", occupantId: null });
  return targets;
}

export function slotLabel(slot: Slot): string {
  return slot.type;
}
