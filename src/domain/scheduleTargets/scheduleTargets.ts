import { addDays, diffDays, formatDayShort } from "../dates";
import { assignMaximumStarts } from "../lineup/assignment";
import type { WeekInput, WeekPlan } from "../lineup/generateWeek";
import { openSlotContext, openSlotEffectiveDate } from "../lineup/openSlot";
import { NHL_TEAM_IDS } from "../nhl/teamIds";
import { isRostered } from "../players/searchPlayers";
import type { DailyLineup, ISODate, MoveTiming, NHLTeamId, Player } from "../types";

// Seven-day bounds make each priority dominate ALL lower-priority factors.
export const TARGET_WEIGHTS = { opportunity: 1_000_000, game: 10_000, slate: 100, backToBack: 10, timing: 1 } as const;
export const SLATE_BANDS = [
  { maximum: 4, bonus: 4 }, { maximum: 7, bonus: 2 }, { maximum: 10, bonus: 1 },
] as const;
export const lowVolumeBonus = (games: number) => SLATE_BANDS.find(b => games <= b.maximum)?.bonus ?? 0;

export type ScheduleTarget = {
  teamAbbrev: NHLTeamId;
  remainingGames: number;
  opportunityGames: number;
  opportunityDates: ISODate[];
  remainingDates: ISODate[];
  lowVolumeGames: number;
  backToBackCount: number;
  backToBackDates: [ISODate, ISODate][];
  score: number;
  reasons: string[];
};
export type ScheduleTargetsResult = {
  status: "ready" | "past" | "no-games" | "no-fit";
  effectiveDate: ISODate;
  targets: ScheduleTarget[];
};

/** Same earliest-date rule used when Add Player is opened from a planner slot. */
export function targetEffectiveDate(weekStart: ISODate, timing: MoveTiming, today: ISODate) {
  return openSlotEffectiveDate(openSlotContext(weekStart, "UTIL"), timing, today);
}

/** Can one extra skater start WITHOUT displacing an existing start or a manual pin?
 * Reuses the engine's maximum matching to allow legitimate multi-position shuffles.
 * A full roster is fine: the eventual Add + Drop review decides who to drop.
 */
function fits(day: DailyLineup, candidate: Player, input: WeekInput): boolean {
  if (!day.openSlots.some(s => s.type !== "G")) return false;
  if (isRostered(candidate, day.roster, input.players)) return false;
  const pinned = new Set(day.activeSlots.filter(a => a.overridden).map(a => a.slot.id));
  const starters = day.activeSlots.filter(a => a.playerId && !a.overridden).map(a => ({
    playerId: a.playerId!, positions: input.players[a.playerId!].eligiblePositions,
  }));
  const assignment = assignMaximumStarts(
    [...starters, { playerId: candidate.id, positions: candidate.eligiblePositions }],
    day.activeSlots.map(a => a.slot), pinned,
  );
  return assignment.size > starters.length;
}

/** Team schedules, not player rankings or confirmed waiver availability.
 * Use the best SINGLE plausible skater's dates; don't union incompatible C/D
 * candidates into an imaginary multi-position player. Inputs are never mutated.
 */
export function getScheduleTargets({ input, plan, today, timing, now }: {
  input: WeekInput; plan: WeekPlan; today: ISODate; timing: MoveTiming; now: string;
}): ScheduleTargetsResult {
  const end = addDays(input.weekStart, 6);
  const effectiveDate = targetEffectiveDate(input.weekStart, timing, today);
  const result: ScheduleTargetsResult = { status: "ready", effectiveDate, targets: [] };
  if (end < today) return { ...result, status: "past" };
  const plannedAdds = (input.plannedTransactions ?? [])
    .filter(t => t.status === "PLANNED" && t.addPlayerId && t.effectiveDate <= end)
    .map(t => ({ playerId: t.addPlayerId!, rosterStatus: "ACTIVE" as const }));
  const unavailable = [...input.roster, ...plannedAdds];
  const candidates = Object.values(input.players).filter(p => p.active !== false &&
    p.eligiblePositions.some(pos => pos !== "G") && !p.eligiblePositions.includes("G") &&
    !isRostered(p, unavailable, input.players));
  let remainingGameCount = 0;
  for (const teamAbbrev of NHL_TEAM_IDS) {
    const games = input.scheduleProvider.getTeamGames(teamAbbrev, effectiveDate, end)
      .filter(g => !g.startTime || Date.parse(g.startTime) > Date.parse(now));
    remainingGameCount += games.length;
    if (!games.length) continue;
    const remainingDates = [...new Set(games.map(g => g.date))].sort();
    // Identical eligibility sets produce identical fits; simulate each set once.
    const profiles = new Map<string, Player>();
    for (const p of candidates.filter(p => p.nhlTeamId === teamAbbrev).sort((a, b) => a.id.localeCompare(b.id))) {
      const key = [...p.eligiblePositions].sort().join(",");
      if (!profiles.has(key)) profiles.set(key, p);
    }
    let best: ScheduleTarget | undefined;
    for (const candidate of profiles.values()) {
      const opportunityDates = remainingDates.filter(date => {
        const day = plan.days.find(d => d.date === date);
        return day && fits(day, candidate, input);
      });
      if (!opportunityDates.length) continue;
      const slateSizes = opportunityDates.map(date => input.scheduleProvider.getGamesForDate(date).length);
      const backToBackDates: [ISODate, ISODate][] = opportunityDates.slice(1)
        .flatMap((date, i) => addDays(opportunityDates[i], 1) === date ? [[opportunityDates[i], date] as [ISODate, ISODate]] : []);
      const lowVolumeGames = slateSizes.filter(n => n <= 7).length;
      const timingBonus = opportunityDates.reduce((sum, date) => sum + (7 - diffDays(date, input.weekStart)) / 28, 0);
      const score = opportunityDates.length * TARGET_WEIGHTS.opportunity + games.length * TARGET_WEIGHTS.game +
        slateSizes.reduce((sum, n) => sum + lowVolumeBonus(n), 0) * TARGET_WEIGHTS.slate +
        backToBackDates.length * TARGET_WEIGHTS.backToBack + timingBonus * TARGET_WEIGHTS.timing;
      const target: ScheduleTarget = { teamAbbrev, remainingGames: games.length, remainingDates,
        opportunityGames: opportunityDates.length, opportunityDates, lowVolumeGames,
        backToBackCount: backToBackDates.length, backToBackDates, score,
        reasons: [
          `${opportunityDates.length} fit your lineup`,
          ...(lowVolumeGames ? [`${lowVolumeGames} low-volume ${lowVolumeGames === 1 ? "night" : "nights"}`] : []),
          ...backToBackDates.map(([a, b]) => `B2B ${formatDayShort(a)}–${formatDayShort(b)}`),
        ] };
      if (!best || target.score > best.score) best = target;
    }
    if (best) result.targets.push(best);
  }
  result.targets.sort((a, b) => b.score - a.score || a.teamAbbrev.localeCompare(b.teamAbbrev));
  result.targets = result.targets.slice(0, 3);
  result.status = result.targets.length ? "ready" : remainingGameCount ? "no-fit" : "no-games";
  return result;
}
