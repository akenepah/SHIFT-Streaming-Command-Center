import { activeSlotCount } from "../config";
import type { RosterConfiguration, RosterPlayer, RosterStatus } from "../types";

export function rosterCapacity(roster: readonly RosterPlayer[], config: RosterConfiguration) {
  const active = roster.filter(r => r.rosterStatus === "ACTIVE").length;
  const bench = roster.filter(r => r.rosterStatus === "BENCH").length;
  const ir = roster.filter(r => r.rosterStatus === "IR_PLUS").length;
  const activeCapacity = activeSlotCount(config);
  const regularCapacity = activeCapacity + config.benchSlots;
  return { active, bench, ir, regular: active + bench, activeCapacity, regularCapacity,
    regularOver: Math.max(0, active + bench - regularCapacity), irOver: Math.max(0, ir - config.irPlusSlots) };
}

/** IR+ is always an explicit choice, never automatic overflow. */
export function defaultRosterStatus(roster: readonly RosterPlayer[], config: RosterConfiguration): RosterStatus {
  return rosterCapacity(roster, config).active < activeSlotCount(config) ? "ACTIVE" : "BENCH";
}

export function canAddToRoster(roster: readonly RosterPlayer[], config: RosterConfiguration, status: RosterStatus): boolean {
  const c = rosterCapacity(roster, config);
  if (status === "IR_PLUS") return c.ir < config.irPlusSlots;
  return c.regular < c.regularCapacity && (status === "ACTIVE" ? c.active < c.activeCapacity : c.bench < config.benchSlots);
}
