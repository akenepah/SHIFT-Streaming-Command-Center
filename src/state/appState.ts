import type { DailyLineupOverride, LeagueSettings, PlannedTransaction, Player, RosterPlayer } from "@/domain/types";

export const APP_STATE_VERSION = 1;

export type AppState = {
  version: typeof APP_STATE_VERSION;
  settings: LeagueSettings;
  /** Every known player: seed players, rostered players and ones the user created. */
  players: Record<string, Player>;
  /** The user's actual fantasy roster, in display order. */
  roster: RosterPlayer[];
  transactions: PlannedTransaction[];
  overrides: DailyLineupOverride[];
  setupComplete: boolean;
};
