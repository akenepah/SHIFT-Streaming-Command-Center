import { activeSlotCount } from "@/domain/config";
import { addDays } from "@/domain/dates";
import type { NHLTeamId } from "@/domain/nhl/teams";
import { getScheduleProvider } from "@/domain/schedule/staticProvider";
import type { ISODate, LeagueSettings, RosterPlayer, RosterStatus } from "@/domain/types";

export const STATUS_LABEL: Record<RosterStatus, string> = { ACTIVE: "Active", BENCH: "Bench", IR_PLUS: "IR+" };

export function rosterCounts(roster: readonly RosterPlayer[]): Record<RosterStatus, number> {
  const counts: Record<RosterStatus, number> = { ACTIVE: 0, BENCH: 0, IR_PLUS: 0 };
  for (const r of roster) counts[r.rosterStatus]++;
  return counts;
}

export function rosterCapacity(settings: LeagueSettings): Record<RosterStatus, number> {
  return {
    ACTIVE: activeSlotCount(settings.roster),
    BENCH: settings.roster.benchSlots,
    IR_PLUS: settings.roster.irPlusSlots,
  };
}

/** Number of games an NHL team plays between two dates (inclusive). */
export function teamGamesBetween(teamId: NHLTeamId, start: ISODate, end: ISODate): number {
  return getScheduleProvider().getTeamGames(teamId, start, end).length;
}

export function teamGamesInWeek(teamId: NHLTeamId, weekStart: ISODate): number {
  return teamGamesBetween(teamId, weekStart, addDays(weekStart, 6));
}
