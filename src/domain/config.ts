import type { LeagueSettings, Position, RosterConfiguration, Slot, SlotType } from "./types";
import { SLOT_TYPES } from "./types";

export const DEFAULT_ROSTER_CONFIGURATION: RosterConfiguration = {
  slots: { C: 3, LW: 3, RW: 3, D: 4, UTIL: 1, G: 1 },
  benchSlots: 5,
  irPlusSlots: 4,
};

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  leagueName: "My League",
  teamName: "My Team",
  season: "2026-27",
  roster: DEFAULT_ROSTER_CONFIGURATION,
  weeklyAcquisitionLimit: 6,
  weekStartsOn: 1,
  minGoalieAppearances: 3,
};

/** Expand slot counts into concrete, ordered slot ids: C1, C2, …, UTIL1, G1. */
export function buildSlots(config: RosterConfiguration): Slot[] {
  const slots: Slot[] = [];
  for (const type of SLOT_TYPES) {
    const count = Math.max(0, Math.floor(config.slots[type] ?? 0));
    for (let i = 1; i <= count; i++) slots.push({ id: `${type}${i}`, type });
  }
  return slots;
}

/** UTIL accepts any skater; every other slot accepts its own position only. */
export function slotAccepts(slotType: SlotType, position: Position): boolean {
  if (slotType === "UTIL") return position !== "G";
  return slotType === position;
}

export function canPlaySlot(positions: readonly Position[], slotType: SlotType): boolean {
  return positions.some((p) => slotAccepts(slotType, p));
}

export function activeSlotCount(config: RosterConfiguration): number {
  return SLOT_TYPES.reduce((n, t) => n + Math.max(0, config.slots[t] ?? 0), 0);
}
