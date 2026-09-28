import { DEFAULT_LEAGUE_SETTINGS } from "@/domain/config";
import type {
  DailyLineupOverride,
  LeagueSettings,
  PlannedTransaction,
  Player,
  RosterPlayer,
  RosterStatus,
} from "@/domain/types";

/**
 * Persisted schema version.
 * v1: private-alpha build that shipped with a sample roster.
 * v2: user data only. The app starts empty, and malformed players are
 *     kept in `needsRepair` instead of being dropped.
 */
export const APP_STATE_VERSION = 2;

/** A stored player record that couldn't be loaded as-is, kept so the user can fix or remove it. */
export type RepairEntry = {
  playerId: string;
  name: string;
  nhlTeamId: string;
  eligiblePositions: string[];
  /** Roster status the player had, or null if they weren't on the roster. */
  rosterStatus: RosterStatus | null;
  problems: string[];
};

export type AppState = {
  version: typeof APP_STATE_VERSION;
  settings: LeagueSettings;
  /** Every player the user has created, rostered or not. */
  players: Record<string, Player>;
  /** The user's actual fantasy roster, in display order. */
  roster: RosterPlayer[];
  transactions: PlannedTransaction[];
  overrides: DailyLineupOverride[];
  setupComplete: boolean;
  needsRepair: RepairEntry[];
};

/** A fresh user: league defaults, no players, no roster, no moves, no overrides. */
export function createInitialState(): AppState {
  return {
    version: APP_STATE_VERSION,
    settings: structuredClone(DEFAULT_LEAGUE_SETTINGS),
    players: {},
    roster: [],
    transactions: [],
    overrides: [],
    setupComplete: false,
    needsRepair: [],
  };
}
