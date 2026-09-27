import { buildSlots } from "../config";
import { projectRoster } from "../roster/projectedRoster";
import { findTeamGame, type ScheduleProvider } from "../schedule/provider";
import type {
  ActiveSlotAssignment,
  DailyLineup,
  ISODate,
  PlannedTransaction,
  Player,
  PlayerDayEntry,
  PlayerGame,
  RosterConfiguration,
  RosterPlayer,
  ScheduleGame,
} from "../types";
import { assignMaximumStarts, type AssignmentCandidate } from "./assignment";

export type PlayerLookup = Readonly<Record<string, Player>>;

export type DailyLineupInput = {
  roster: readonly RosterPlayer[];
  players: PlayerLookup;
  date: ISODate;
  scheduleProvider: ScheduleProvider;
  rosterConfiguration: RosterConfiguration;
  plannedTransactions?: readonly PlannedTransaction[];
};

export function toPlayerGame(game: ScheduleGame, teamId: Player["nhlTeamId"]): PlayerGame {
  const isHome = game.homeTeam === teamId;
  return {
    gameId: game.id,
    opponent: isHome ? game.awayTeam : game.homeTeam,
    isHome,
    startTime: game.startTime,
  };
}

/**
 * Derive one day's lineup from the roster, the schedule, position eligibility,
 * league slots and planned moves. The roster itself is never changed.
 *
 * - IR+ players never start, even when their team plays.
 * - Players whose team doesn't play go to `noGame` and use no slot.
 * - Players whose team plays are placed to maximize starts; anyone left over
 *   goes to `benchedGames`.
 * - Active slots left empty are reported in `openSlots`.
 */
export function generateDailyLineup(input: DailyLineupInput): DailyLineup {
  const { players, date, scheduleProvider, rosterConfiguration } = input;
  const roster = projectRoster(input.roster, input.plannedTransactions ?? [], date);
  const slots = buildSlots(rosterConfiguration);

  const irPlus: PlayerDayEntry[] = [];
  const noGame: PlayerDayEntry[] = [];
  const playing: { rosterPlayer: RosterPlayer; player: Player; game: PlayerGame }[] = [];

  for (const rosterPlayer of roster) {
    const player = players[rosterPlayer.playerId];
    if (!player) continue;
    const scheduleGame = findTeamGame(scheduleProvider, player.nhlTeamId, date);
    const game = scheduleGame ? toPlayerGame(scheduleGame, player.nhlTeamId) : null;

    if (rosterPlayer.rosterStatus === "IR_PLUS") irPlus.push({ playerId: player.id, game });
    else if (!game) noGame.push({ playerId: player.id, game: null });
    else playing.push({ rosterPlayer, player, game });
  }

  // Priority: players the user marked ACTIVE come before BENCH; roster order breaks ties.
  const ordered = [
    ...playing.filter((p) => p.rosterPlayer.rosterStatus === "ACTIVE"),
    ...playing.filter((p) => p.rosterPlayer.rosterStatus !== "ACTIVE"),
  ];
  const candidates: AssignmentCandidate[] = ordered.map((p) => ({
    playerId: p.player.id,
    positions: p.player.eligiblePositions,
  }));
  const assignment = assignMaximumStarts(candidates, slots);

  const gameByPlayer = new Map(ordered.map((p) => [p.player.id, p.game]));
  const activeSlots: ActiveSlotAssignment[] = slots.map((slot) => {
    const playerId = assignment.get(slot.id) ?? null;
    return {
      slot,
      playerId,
      game: playerId ? gameByPlayer.get(playerId) ?? null : null,
      overridden: false,
    };
  });

  const starters = new Set(assignment.values());
  const benchedGames = ordered
    .filter((p) => !starters.has(p.player.id))
    .map((p) => ({ playerId: p.player.id, game: p.game }));

  return {
    date,
    nhlGameCount: scheduleProvider.getGamesForDate(date).length,
    roster,
    activeSlots,
    benchedGames,
    noGame,
    irPlus,
    openSlots: activeSlots.filter((a) => a.playerId === null).map((a) => a.slot),
    appliedOverrides: [],
    ignoredOverrides: [],
  };
}
