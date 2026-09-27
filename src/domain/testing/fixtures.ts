/**
 * Small hand-built fixtures for engine tests. These are not real NHL data.
 */
import { DEFAULT_ROSTER_CONFIGURATION } from "../config";
import { InMemoryScheduleProvider } from "../schedule/provider";
import type {
  NHLTeamId,
  PlannedTransaction,
  Player,
  Position,
  RosterConfiguration,
  RosterPlayer,
  RosterStatus,
  ScheduleGame,
  SlotType,
} from "../types";

let gameSeq = 0;
export function game(date: string, awayTeam: NHLTeamId, homeTeam: NHLTeamId): ScheduleGame {
  return { id: `g${++gameSeq}`, date, homeTeam, awayTeam };
}

export function schedule(games: ScheduleGame[]) {
  return new InMemoryScheduleProvider(games);
}

export function player(id: string, nhlTeamId: NHLTeamId, ...eligiblePositions: Position[]): Player {
  return { id, name: id, nhlTeamId, eligiblePositions };
}

export function playerMap(...players: Player[]): Record<string, Player> {
  return Object.fromEntries(players.map((p) => [p.id, p]));
}

export function rostered(playerId: string, rosterStatus: RosterStatus = "ACTIVE"): RosterPlayer {
  return { playerId, rosterStatus };
}

export function slotsConfig(slots: Partial<Record<SlotType, number>>): RosterConfiguration {
  return {
    ...DEFAULT_ROSTER_CONFIGURATION,
    slots: { C: 0, LW: 0, RW: 0, D: 0, UTIL: 0, G: 0, ...slots },
  };
}

let txSeq = 0;
export function tx(partial: Omit<PlannedTransaction, "id" | "status" | "createdAt"> & Partial<PlannedTransaction>): PlannedTransaction {
  txSeq++;
  return {
    id: `t${txSeq}`,
    status: "PLANNED",
    createdAt: `2026-09-01T00:00:${String(txSeq).padStart(2, "0")}Z`,
    ...partial,
  };
}
