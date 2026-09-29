import { activeSlotCount, buildSlots } from "../config";
import { assignMaximumStarts } from "../lineup/assignment";
import type { Player, RosterConfiguration, RosterPlayer, RosterStatus } from "../types";

/** The player being added or re-statused, so Active can be checked by position. */
export type ActiveCandidate = { playerId: string; players: Readonly<Record<string, Player>> };

/**
 * Would this player fill an open baseline lineup slot? Uses the engine's
 * maximum matching, so a D can go Active whenever a D (or UTIL) slot is open,
 * even if surplus Active forwards already push the Active count to capacity.
 */
export function fillsOpenActiveSlot(roster: readonly RosterPlayer[], config: RosterConfiguration, candidate: ActiveCandidate): boolean {
  const player = candidate.players[candidate.playerId];
  if (!player) return false;
  const slots = buildSlots(config);
  const active = roster
    .filter((r) => r.rosterStatus === "ACTIVE" && r.playerId !== candidate.playerId && candidate.players[r.playerId])
    .map((r) => ({ playerId: r.playerId, positions: candidate.players[r.playerId].eligiblePositions }));
  const before = assignMaximumStarts(active, slots).size;
  const after = assignMaximumStarts([...active, { playerId: player.id, positions: player.eligiblePositions }], slots).size;
  return after > before;
}

export function rosterCapacity(roster: readonly RosterPlayer[], config: RosterConfiguration) {
  const active = roster.filter(r => r.rosterStatus === "ACTIVE").length;
  const bench = roster.filter(r => r.rosterStatus === "BENCH").length;
  const ir = roster.filter(r => r.rosterStatus === "IR_PLUS").length;
  const activeCapacity = activeSlotCount(config);
  const regularCapacity = activeCapacity + config.benchSlots;
  return { active, bench, ir, regular: active + bench, activeCapacity, regularCapacity,
    regularOver: Math.max(0, active + bench - regularCapacity), irOver: Math.max(0, ir - config.irPlusSlots) };
}

/**
 * Active is allowed while the Active count is under the number of lineup
 * slots, OR when this player would fill an open slot for their positions
 * (surplus Active players at other positions don't block them).
 */
function activeAllowed(roster: readonly RosterPlayer[], config: RosterConfiguration, candidate?: ActiveCandidate): boolean {
  return rosterCapacity(roster, config).active < activeSlotCount(config) || (!!candidate && fillsOpenActiveSlot(roster, config, candidate));
}

/** IR+ is always an explicit choice, never automatic overflow. */
export function defaultRosterStatus(roster: readonly RosterPlayer[], config: RosterConfiguration, candidate?: ActiveCandidate): RosterStatus {
  return activeAllowed(roster, config, candidate) ? "ACTIVE" : "BENCH";
}

export function canAddToRoster(
  roster: readonly RosterPlayer[],
  config: RosterConfiguration,
  status: RosterStatus,
  candidate?: ActiveCandidate,
): boolean {
  const c = rosterCapacity(roster, config);
  if (status === "IR_PLUS") return c.ir < config.irPlusSlots;
  return c.regular < c.regularCapacity && (status === "ACTIVE" ? activeAllowed(roster, config, candidate) : c.bench < config.benchSlots);
}

/** Why a status change would be refused, for honest UI feedback (null = allowed). */
export function statusChangeBlocker(
  roster: readonly RosterPlayer[],
  config: RosterConfiguration,
  status: RosterStatus,
  candidate: ActiveCandidate,
): string | null {
  const others = roster.filter((r) => r.playerId !== candidate.playerId);
  if (canAddToRoster(others, config, status, candidate)) return null;
  if (status === "IR_PLUS") return `IR+ is full (${config.irPlusSlots} slots).`;
  if (status === "BENCH") return `Bench is full (${config.benchSlots} slots).`;
  const positions = candidate.players[candidate.playerId]?.eligiblePositions.join("/") ?? "their position";
  return `No open lineup slot for ${positions}. Bench another Active player first.`;
}
