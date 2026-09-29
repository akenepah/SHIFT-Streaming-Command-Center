import { addDays } from "../dates";
import type { DailyLineup, ISODate, MoveTiming, SlotType } from "../types";

/** Slot types that can be filled from the planner. BN and IR+ are never "add a player here" targets. */
export const ACTIVE_SLOT_TYPES: readonly SlotType[] = ["C", "LW", "RW", "D", "UTIL", "G"];

/** Where an Add Player flow was started from, and for which lineup opportunity. */
export type OpenSlotContext = {
  source: "weekly-planner-open-slot";
  date: ISODate;
  position: SlotType;
  slotId?: string;
};

export function openSlotContext(date: ISODate, position: SlotType, slotId?: string): OpenSlotContext {
  return { source: "weekly-planner-open-slot", date, position, ...(slotId ? { slotId } : {}) };
}

/**
 * Default effective date for a move started from an open slot: the clicked
 * day, unless the league's move timing makes that impossible (a "next day"
 * league can't add a player for today). The league rule itself is unchanged.
 */
export function openSlotEffectiveDate(ctx: OpenSlotContext, timing: MoveTiming, today: ISODate): ISODate {
  const earliest = timing === "TODAY" ? today : addDays(today, 1);
  return ctx.date >= earliest ? ctx.date : earliest;
}

export type OpportunityTone = "very-high" | "strong" | "moderate" | "limited" | "none" | "na";

/**
 * Streaming opportunity for a day: the share of active lineup slots already
 * filled by players with games. A low fill means lots of room to stream, so
 * the scale runs green (open) to red (full). Days without NHL games, or with
 * no active slots, are neutral. Not based on league-wide game density.
 */
export function opportunityTone(day: Pick<DailyLineup, "activeSlots" | "nhlGameCount">): OpportunityTone {
  const total = day.activeSlots.length;
  if (total === 0 || day.nhlGameCount === 0) return "na";
  const filled = day.activeSlots.filter((a) => a.playerId).length / total;
  if (filled >= 1) return "none";
  if (filled >= 0.75) return "limited";
  if (filled >= 0.5) return "moderate";
  if (filled >= 0.25) return "strong";
  return "very-high";
}
