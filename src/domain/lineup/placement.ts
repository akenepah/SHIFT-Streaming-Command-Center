import { canPlaySlot } from "../config";
import { BENCH_TARGET, type DailyLineup, type DailyLineupOverride } from "../types";
import { generateDailyLineup, type DailyLineupInput } from "./generateDailyLineup";
import type { OpenSlotContext } from "./openSlot";

/** Preserve the clicked open slot and existing players where that costs no starts.
 * The maximum-matching engine remains authoritative when a stable placement cannot fit.
 */
export function placePlannedAddition(before: DailyLineup, input: DailyLineupInput, playerId: string, context: OpenSlotContext) {
  const automatic = generateDailyLineup(input);
  const player = input.players[playerId];
  const target = before.activeSlots.find(a => context.slotId ? a.slot.id === context.slotId : !a.playerId && a.slot.type === context.position);
  if (!player || !target || target.playerId || !canPlaySlot(player.eligiblePositions, target.slot.type)) return { day: automatic, overrides: null };
  const playing = new Set([...automatic.activeSlots.map(a => a.playerId), ...automatic.benchedGames.map(b => b.playerId)]);
  if (!playing.has(playerId)) return { day: automatic, overrides: null };
  const pin = { date: input.date, playerId, targetSlotId: target.slot.id };
  const stable: DailyLineupOverride[] = [
    ...before.activeSlots.filter(a => a.playerId && playing.has(a.playerId)).map(a => ({ date: input.date, playerId: a.playerId!, targetSlotId: a.slot.id })),
    ...before.benchedGames.filter(b => playing.has(b.playerId)).map(b => ({ date: input.date, playerId: b.playerId, targetSlotId: BENCH_TARGET })),
    pin,
  ];
  const original = (input.overrides ?? []).filter(o => o.date === input.date && o.playerId !== playerId && o.targetSlotId !== target.slot.id);
  const count = (d: DailyLineup) => d.activeSlots.filter(a => a.playerId).length;
  for (const overrides of [stable, [...original, pin]]) {
    const day = generateDailyLineup({ ...input, overrides });
    if (!day.ignoredOverrides.length && count(day) >= count(automatic)) return { day, overrides };
  }
  return { day: automatic, overrides: null };
}
