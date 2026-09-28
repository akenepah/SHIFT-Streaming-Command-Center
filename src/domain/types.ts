/**
 * Core domain types for the SHIFT planner.
 *
 * Date convention: every date in the domain is an NHL calendar-date string
 * "YYYY-MM-DD" (the local date the NHL lists the game under). Dates are never
 * parsed into local-time Date objects, so time zones can't move a game onto a
 * different day. See src/domain/dates.ts.
 */

import type { NHLTeamId } from "./nhl/teamIds";

export type { NHLTeamId };

export type ISODate = string;

export type Position = "C" | "LW" | "RW" | "D" | "G";
export const POSITIONS: readonly Position[] = ["C", "LW", "RW", "D", "G"];

export type SlotType = "C" | "LW" | "RW" | "D" | "UTIL" | "G";
export const SLOT_TYPES: readonly SlotType[] = ["C", "LW", "RW", "D", "UTIL", "G"];

export type ScheduleGame = {
  id: string;
  date: ISODate;
  homeTeam: NHLTeamId;
  awayTeam: NHLTeamId;
  /** ISO-8601 UTC start time. Informational only; never used for grouping. */
  startTime?: string;
};

export type Player = {
  id: string;
  name: string;
  nhlTeamId: NHLTeamId;
  eligiblePositions: Position[];
  headshot?: string;
  /** NHL player id, for players that came from the bundled catalog. */
  nhlId?: number;
  /** True for players the user created by hand. */
  custom?: boolean;
};

export type RosterStatus = "ACTIVE" | "BENCH" | "IR_PLUS";

export type RosterPlayer = {
  playerId: string;
  rosterStatus: RosterStatus;
};

export type RosterConfiguration = {
  slots: Record<SlotType, number>;
  benchSlots: number;
  irPlusSlots: number;
};

/** When a newly planned move takes effect by default. Each move can still pick its own date. */
export type MoveTiming = "TODAY" | "NEXT_DAY";

export type LeagueSettings = {
  leagueName: string;
  teamName: string;
  season: string;
  /** Informational: teams in the fantasy league. */
  numberOfTeams: number;
  defaultMoveTiming: MoveTiming;
  roster: RosterConfiguration;
  weeklyAcquisitionLimit: number;
  /** Day the fantasy week (and acquisition count) resets. 0 = Sunday … 1 = Monday. */
  weekStartsOn: number;
  minGoalieAppearances: number;
};

export type TransactionType = "ADD" | "DROP" | "ADD_DROP";

export type PlannedTransaction = {
  id: string;
  type: TransactionType;
  addPlayerId?: string;
  dropPlayerId?: string;
  effectiveDate: ISODate;
  status: "PLANNED" | "CANCELLED";
  createdAt: string;
};

/** Special override target that keeps a playing player out of the lineup. */
export const BENCH_TARGET = "BN";

export type DailyLineupOverride = {
  date: ISODate;
  playerId: string;
  /** An active slot id such as "RW2", or BENCH_TARGET. */
  targetSlotId: string;
};

export type Slot = {
  id: string;
  type: SlotType;
};

export type PlayerGame = {
  gameId: string;
  opponent: NHLTeamId;
  isHome: boolean;
  startTime?: string;
};

export type ActiveSlotAssignment = {
  slot: Slot;
  playerId: string | null;
  game: PlayerGame | null;
  /** True when a user override placed the player here. */
  overridden: boolean;
};

export type PlayerDayEntry = {
  playerId: string;
  game: PlayerGame | null;
};

export type DailyLineup = {
  date: ISODate;
  nhlGameCount: number;
  /** Projected roster for this date (base roster + planned moves). */
  roster: RosterPlayer[];
  activeSlots: ActiveSlotAssignment[];
  benchedGames: PlayerDayEntry[];
  noGame: PlayerDayEntry[];
  irPlus: PlayerDayEntry[];
  openSlots: Slot[];
  appliedOverrides: DailyLineupOverride[];
  ignoredOverrides: DailyLineupOverride[];
};
