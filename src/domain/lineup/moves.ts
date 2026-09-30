import { canPlaySlot } from "../config";
import { BENCH_TARGET, type DailyLineup, type DailyLineupOverride, type Player, type Slot, type SlotType } from "../types";

/**
 * Explicit, per-day lineup moves.
 *
 * A day starts out automatic: the engine starts everyone it can. The first
 * manual move on a day records that day's whole lineup (every player with a
 * game is pinned to their slot or the bench), then applies just the requested
 * change. From then on the day only changes when the user changes it: no
 * player is silently cycled in or out, and other days are never touched.
 * "Reset day lineup" returns the day to automatic.
 */

export type MoveOption = {
  /** Destination slot id. */
  targetSlotId: string;
  slotType: SlotType;
  /** Who is in the destination now (null = open slot). */
  occupantId: string | null;
  /** Where the occupant goes: the mover's old slot, or the bench. Null when the slot is open. */
  occupantTo: string | null;
};

export type LineupMove = {
  playerId: string;
  /** An active slot id, or BENCH_TARGET. */
  targetSlotId: string;
  /** When benching a starter: who takes their slot (must be benched with a game and eligible). */
  replacementId?: string | null;
};

type Assignment = Map<string, string | null>; // slotId → playerId

const assignmentOf = (day: DailyLineup): Assignment => new Map(day.activeSlots.map((a) => [a.slot.id, a.playerId]));
const slotOf = (day: DailyLineup, playerId: string) => day.activeSlots.find((a) => a.playerId === playerId)?.slot ?? null;
const isBenched = (day: DailyLineup, playerId: string) => day.benchedGames.some((b) => b.playerId === playerId);
const isPlaying = (day: DailyLineup, playerId: string) => !!slotOf(day, playerId) || isBenched(day, playerId);

/**
 * Every destination this player can legally be moved to on this day, one per
 * slot: open slots of an eligible type, and occupied eligible slots as swaps.
 * The bench isn't listed here (see `benchReplacements`).
 */
export function moveOptions(
  day: DailyLineup,
  player: Player,
  players: Readonly<Record<string, Player>>,
  /** Drag-and-drop needs every open slot as a target, not one per type. */
  { everyOpenSlot = false }: { everyOpenSlot?: boolean } = {},
): MoveOption[] {
  if (!isPlaying(day, player.id)) return [];
  const from = slotOf(day, player.id);
  const options: MoveOption[] = [];
  const seenOpenType = new Set<SlotType>();
  for (const a of day.activeSlots) {
    if (a.slot.id === from?.id || !canPlaySlot(player.eligiblePositions, a.slot.type)) continue;
    if (a.playerId === null) {
      // One entry per open slot type is enough: open slots of the same type are interchangeable.
      if (seenOpenType.has(a.slot.type) && !everyOpenSlot) continue;
      seenOpenType.add(a.slot.type);
      options.push({ targetSlotId: a.slot.id, slotType: a.slot.type, occupantId: null, occupantTo: null });
      continue;
    }
    // Swapping with someone in the same slot type as the mover changes nothing.
    if (from && from.type === a.slot.type) continue;
    options.push({ targetSlotId: a.slot.id, slotType: a.slot.type, occupantId: a.playerId, occupantTo: occupantDestination(players, a.playerId, from) });
  }
  return options;
}

/** Where a displaced occupant lands: the mover's old slot when eligible, otherwise the bench. */
function occupantDestination(players: Readonly<Record<string, Player>>, occupantId: string, moverFrom: Slot | null): string {
  return moverFrom && canPlay(players, occupantId, moverFrom.type) ? moverFrom.id : BENCH_TARGET;
}

function canPlay(players: Readonly<Record<string, Player>>, playerId: string, type: SlotType): boolean {
  const p = players[playerId];
  return !!p && canPlaySlot(p.eligiblePositions, type);
}

/** Slot types this player can never fill (to explain unavailable destinations). */
export function ineligibleSlotTypes(day: DailyLineup, player: Player): SlotType[] {
  const types = [...new Set(day.activeSlots.map((a) => a.slot.type))];
  return types.filter((t) => !canPlaySlot(player.eligiblePositions, t));
}

/** Benched players (with a game today) who could take this slot. */
export function benchReplacements(day: DailyLineup, slotId: string, players: Readonly<Record<string, Player>>): string[] {
  const slot = day.activeSlots.find((a) => a.slot.id === slotId)?.slot;
  if (!slot) return [];
  return day.benchedGames.map((b) => b.playerId).filter((id) => {
    const p = players[id];
    return !!p && canPlaySlot(p.eligiblePositions, slot.type);
  });
}

/**
 * Apply one explicit move to one day. Returns the full override list with that
 * date's entries replaced by a complete snapshot of the resulting lineup, or
 * null if the move isn't legal (the caller should reject it, never guess).
 * Guarantees: no player in two slots, no slot with two players, nobody with a
 * game lost (everyone not in a slot is pinned to the bench).
 */
export function applyLineupMove(
  overrides: readonly DailyLineupOverride[],
  day: DailyLineup,
  players: Readonly<Record<string, Player>>,
  move: LineupMove,
): DailyLineupOverride[] | null {
  const mover = players[move.playerId];
  if (!mover || !isPlaying(day, mover.id)) return null;
  const assign = assignmentOf(day);
  const from = slotOf(day, mover.id);

  if (move.targetSlotId === BENCH_TARGET) {
    if (!from) return null; // already on the bench
    const replacement = move.replacementId ?? null;
    if (replacement !== null && !benchReplacements(day, from.id, players).includes(replacement)) return null;
    assign.set(from.id, replacement);
  } else {
    const target = day.activeSlots.find((a) => a.slot.id === move.targetSlotId)?.slot;
    if (!target || target.id === from?.id || !canPlaySlot(mover.eligiblePositions, target.type)) return null;
    const occupant = assign.get(target.id) ?? null;
    assign.set(target.id, mover.id);
    if (from) assign.set(from.id, occupant && canPlay(players, occupant, from.type) ? occupant : null);
  }

  const snapshot = snapshotFor(day, assign);
  if (!snapshot) return null;
  return [...overrides.filter((o) => o.date !== day.date), ...snapshot];
}

/** Pin every player with a game: starters to their slot, everyone else to the bench. */
function snapshotFor(day: DailyLineup, assign: Assignment): DailyLineupOverride[] | null {
  const starters = [...assign.values()].filter((id): id is string => !!id);
  if (new Set(starters).size !== starters.length) return null; // never put one player in two slots
  const playing = [...day.activeSlots.map((a) => a.playerId), ...day.benchedGames.map((b) => b.playerId)].filter(
    (id): id is string => !!id,
  );
  const out: DailyLineupOverride[] = [];
  for (const [slotId, playerId] of assign) if (playerId) out.push({ date: day.date, playerId, targetSlotId: slotId });
  for (const id of new Set(playing)) if (!starters.includes(id)) out.push({ date: day.date, playerId: id, targetSlotId: BENCH_TARGET });
  return out;
}

/** True when the user has set this day's lineup by hand (any override for the date). */
export function isManualDay(overrides: readonly DailyLineupOverride[], date: string): boolean {
  return overrides.some((o) => o.date === date);
}
