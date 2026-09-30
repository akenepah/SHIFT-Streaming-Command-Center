import type { DailyLineupOverride, PlannedTransaction } from "../types";

/** Warn about retained planned moves and the daily choices removed by a base-roster drop. */
export function dropImpact(playerId: string, transactions: readonly PlannedTransaction[], overrides: readonly DailyLineupOverride[], today: string) {
  return {
    moves: transactions.filter(t => t.status === "PLANNED" && (t.addPlayerId === playerId || t.dropPlayerId === playerId)),
    dates: [...new Set(overrides.filter(o => o.playerId === playerId && o.date >= today).map(o => o.date))].sort(),
  };
}
