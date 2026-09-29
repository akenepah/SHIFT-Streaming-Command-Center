import { weekDates } from "../dates";
import type { DailyLineup, ISODate } from "../types";
import { generateDailyLineup, type DailyLineupInput } from "./generateDailyLineup";

export type WeekInput = Omit<DailyLineupInput, "date"> & {
  weekStart: ISODate;
};

export type WeekSummary = {
  gamesStarted: number;
  benchedGames: number;
  openSlotDays: number;
  goalieStarts: number;
  nhlGames: number;
  /** Games started per player across the week. */
  startsByPlayer: Record<string, number>;
  /** Games played by the player's NHL team, whether started, benched or IR+. */
  gamesByPlayer: Record<string, number>;
};

export type WeekPlan = {
  weekStart: ISODate;
  days: DailyLineup[];
  summary: WeekSummary;
};

export function summarizeDays(days: readonly DailyLineup[]): WeekSummary {
  const summary: WeekSummary = {
    gamesStarted: 0,
    benchedGames: 0,
    openSlotDays: 0,
    goalieStarts: 0,
    nhlGames: 0,
    startsByPlayer: {},
    gamesByPlayer: {},
  };
  for (const day of days) {
    summary.nhlGames += day.nhlGameCount;
    summary.benchedGames += day.benchedGames.length;
    summary.openSlotDays += day.openSlots.length;
    for (const a of day.activeSlots) {
      if (!a.playerId) continue;
      summary.gamesStarted++;
      if (a.slot.type === "G") summary.goalieStarts++;
      summary.startsByPlayer[a.playerId] = (summary.startsByPlayer[a.playerId] ?? 0) + 1;
      summary.gamesByPlayer[a.playerId] = (summary.gamesByPlayer[a.playerId] ?? 0) + 1;
    }
    for (const e of [...day.benchedGames, ...day.irPlus]) {
      if (e.game) summary.gamesByPlayer[e.playerId] = (summary.gamesByPlayer[e.playerId] ?? 0) + 1;
    }
  }
  return summary;
}

/** Seven derived daily lineups starting at `weekStart`, plus weekly totals. */
export function generateWeek(input: WeekInput): WeekPlan {
  const { weekStart, ...rest } = input;
  const days = weekDates(weekStart).map((date) => generateDailyLineup({ ...rest, date }));
  return { weekStart, days, summary: summarizeDays(days) };
}
