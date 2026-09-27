import { DEFAULT_LEAGUE_SETTINGS } from "@/domain/config";
import { isValidISODate } from "@/domain/dates";
import { isNHLTeamId } from "@/domain/nhl/teamIds";
import {
  POSITIONS,
  SLOT_TYPES,
  type DailyLineupOverride,
  type LeagueSettings,
  type PlannedTransaction,
  type Player,
  type Position,
  type RosterPlayer,
} from "@/domain/types";
import { APP_STATE_VERSION, type AppState } from "./appState";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const int = (v: unknown, fallback: number, min = 0, max = 99) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

function parseSettings(v: unknown): LeagueSettings {
  const d = DEFAULT_LEAGUE_SETTINGS;
  if (!isObj(v)) return structuredClone(d);
  const roster = isObj(v.roster) ? v.roster : {};
  const slots = isObj(roster.slots) ? roster.slots : {};
  return {
    leagueName: str(v.leagueName, d.leagueName),
    teamName: str(v.teamName, d.teamName),
    season: str(v.season, d.season),
    roster: {
      slots: Object.fromEntries(SLOT_TYPES.map((t) => [t, int(slots[t], d.roster.slots[t], 0, 10)])) as LeagueSettings["roster"]["slots"],
      benchSlots: int(roster.benchSlots, d.roster.benchSlots, 0, 20),
      irPlusSlots: int(roster.irPlusSlots, d.roster.irPlusSlots, 0, 10),
    },
    weeklyAcquisitionLimit: int(v.weeklyAcquisitionLimit, d.weeklyAcquisitionLimit, 0, 50),
    weekStartsOn: int(v.weekStartsOn, d.weekStartsOn, 0, 6),
    minGoalieAppearances: int(v.minGoalieAppearances, d.minGoalieAppearances, 0, 14),
  };
}

function parsePlayer(v: unknown): Player | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.name !== "string" || !isNHLTeamId(v.nhlTeamId)) return null;
  const positions = Array.isArray(v.eligiblePositions)
    ? [...new Set(v.eligiblePositions.filter((p): p is Position => POSITIONS.includes(p as Position)))]
    : [];
  if (!positions.length) return null;
  return {
    id: v.id,
    name: v.name,
    nhlTeamId: v.nhlTeamId,
    eligiblePositions: positions,
    ...(typeof v.headshot === "string" && v.headshot ? { headshot: v.headshot } : {}),
    ...(v.custom === true ? { custom: true } : {}),
  };
}

function parseTransaction(v: unknown): PlannedTransaction | null {
  if (!isObj(v) || typeof v.id !== "string" || !isValidISODate(v.effectiveDate)) return null;
  if (v.type !== "ADD" && v.type !== "DROP" && v.type !== "ADD_DROP") return null;
  if (v.status !== "PLANNED" && v.status !== "CANCELLED") return null;
  return {
    id: v.id,
    type: v.type,
    addPlayerId: typeof v.addPlayerId === "string" ? v.addPlayerId : undefined,
    dropPlayerId: typeof v.dropPlayerId === "string" ? v.dropPlayerId : undefined,
    effectiveDate: v.effectiveDate,
    status: v.status,
    createdAt: str(v.createdAt, ""),
  };
}

function parseOverride(v: unknown): DailyLineupOverride | null {
  if (!isObj(v) || !isValidISODate(v.date) || typeof v.playerId !== "string" || typeof v.targetSlotId !== "string")
    return null;
  return { date: v.date, playerId: v.playerId, targetSlotId: v.targetSlotId };
}

/**
 * Turn stored JSON into a valid AppState. Returns null when the payload isn't
 * a v1 state at all. Otherwise invalid individual records are dropped, so
 * one bad entry can't break the whole app.
 */
export function parseAppState(raw: unknown): AppState | null {
  if (!isObj(raw) || raw.version !== APP_STATE_VERSION) return null;

  const players: Record<string, Player> = {};
  if (isObj(raw.players)) {
    for (const value of Object.values(raw.players)) {
      const p = parsePlayer(value);
      if (p) players[p.id] = p;
    }
  }

  const seen = new Set<string>();
  const roster: RosterPlayer[] = [];
  for (const r of Array.isArray(raw.roster) ? raw.roster : []) {
    if (!isObj(r) || typeof r.playerId !== "string" || !players[r.playerId] || seen.has(r.playerId)) continue;
    const status = r.rosterStatus === "BENCH" || r.rosterStatus === "IR_PLUS" ? r.rosterStatus : "ACTIVE";
    roster.push({ playerId: r.playerId, rosterStatus: status });
    seen.add(r.playerId);
  }

  const list = <T>(v: unknown, f: (x: unknown) => T | null) =>
    (Array.isArray(v) ? v : []).map(f).filter((x): x is T => x !== null);

  return {
    version: APP_STATE_VERSION,
    settings: parseSettings(raw.settings),
    players,
    roster,
    transactions: list(raw.transactions, parseTransaction),
    overrides: list(raw.overrides, parseOverride),
    setupComplete: raw.setupComplete === true,
  };
}
