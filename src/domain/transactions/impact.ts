import { generateWeek, type WeekInput, type WeekSummary } from "../lineup/generateWeek";
import type { PlannedTransaction } from "../types";

export type MoveImpact = {
  before: WeekSummary;
  after: WeekSummary;
  /** Change in games started this week. Positive means more games. */
  gamesStartedDelta: number;
  benchedGamesDelta: number;
  goalieStartsDelta: number;
};

/**
 * How a candidate move would change the week, compared with the plan
 * as it stands (all other planned moves included).
 */
export function evaluateMoveImpact(week: WeekInput, candidate: PlannedTransaction): MoveImpact {
  const others = (week.plannedTransactions ?? []).filter((t) => t.id !== candidate.id);
  const before = generateWeek({ ...week, plannedTransactions: others }).summary;
  const after = generateWeek({ ...week, plannedTransactions: [...others, candidate] }).summary;
  return {
    before,
    after,
    gamesStartedDelta: after.gamesStarted - before.gamesStarted,
    benchedGamesDelta: after.benchedGames - before.benchedGames,
    goalieStartsDelta: after.goalieStarts - before.goalieStarts,
  };
}
