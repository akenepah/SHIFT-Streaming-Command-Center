import { buildSlots, canPlaySlot } from "../config";
import { projectRoster } from "../roster/projectedRoster";
import { findTeamGame, type ScheduleProvider } from "../schedule/provider";
import {
  BENCH_TARGET,
  type ActiveSlotAssignment,
  type DailyLineup,
  type DailyLineupOverride,
  type ISODate,
  type PlannedTransaction,
  type Player,
  type PlayerDayEntry,
  type PlayerGame,
  type RosterConfiguration,
  type RosterPlayer,
  type ScheduleGame,
  type Slot,
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
  overrides?: readonly DailyLineupOverride[];
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
 * - User overrides for the date pin a player to a slot (or the bench) first;
 *   everyone else is then placed around them to maximize starts. Overrides
 *   that no longer make sense are reported in `ignoredOverrides` and skipped.
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

  const { pinnedSlots, pinnedBench, applied, ignored } = resolveOverrides(
    (input.overrides ?? []).filter((o) => o.date === date),
    ordered.map((p) => p.player),
    slots,
  );

  const pinnedPlayers = new Set([...pinnedSlots.values(), ...pinnedBench]);
  const candidates: AssignmentCandidate[] = ordered
    .filter((p) => !pinnedPlayers.has(p.player.id))
    .map((p) => ({ playerId: p.player.id, positions: p.player.eligiblePositions }));
  const assignment = assignMaximumStarts(candidates, slots, new Set(pinnedSlots.keys()));
  for (const [slotId, playerId] of pinnedSlots) assignment.set(slotId, playerId);

  const gameByPlayer = new Map(ordered.map((p) => [p.player.id, p.game]));
  const activeSlots: ActiveSlotAssignment[] = slots.map((slot) => {
    const playerId = assignment.get(slot.id) ?? null;
    return {
      slot,
      playerId,
      game: playerId ? gameByPlayer.get(playerId) ?? null : null,
      overridden: pinnedSlots.has(slot.id),
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
    appliedOverrides: applied,
    ignoredOverrides: ignored,
  };
}

/**
 * Validate one day's overrides against the players who have a game that day.
 * An override is ignored when the player isn't playing (or isn't rostered, or
 * is on IR+), the slot no longer exists, the player isn't eligible for it,
 * or another override already claimed the slot. Later overrides for the same
 * player replace earlier ones.
 */
function resolveOverrides(
  overrides: readonly DailyLineupOverride[],
  playingPlayers: readonly Player[],
  slots: readonly Slot[],
) {
  const pinnedSlots = new Map<string, string>(); // slotId → playerId
  const pinnedBench = new Set<string>();
  const applied: DailyLineupOverride[] = [];
  const ignored: DailyLineupOverride[] = [];

  const latest = new Map<string, DailyLineupOverride>();
  for (const o of overrides) latest.set(o.playerId, o);
  for (const o of overrides) if (latest.get(o.playerId) !== o) ignored.push(o);

  for (const o of latest.values()) {
    const player = playingPlayers.find((p) => p.id === o.playerId);
    if (!player) {
      ignored.push(o);
      continue;
    }
    if (o.targetSlotId === BENCH_TARGET) {
      pinnedBench.add(o.playerId);
      applied.push(o);
      continue;
    }
    const slot = slots.find((s) => s.id === o.targetSlotId);
    if (!slot || pinnedSlots.has(slot.id) || !canPlaySlot(player.eligiblePositions, slot.type)) {
      ignored.push(o);
      continue;
    }
    pinnedSlots.set(slot.id, o.playerId);
    applied.push(o);
  }
  return { pinnedSlots, pinnedBench, applied, ignored };
}
