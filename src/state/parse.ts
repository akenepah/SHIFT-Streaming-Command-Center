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
  type RosterStatus,
} from "@/domain/types";
import { APP_STATE_VERSION, type AppState, type RepairEntry } from "./appState";
import { isUntouchedDemoPlayer } from "./legacyDemo";

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
    numberOfTeams: int(v.numberOfTeams, d.numberOfTeams, 2, 32),
    defaultMoveTiming: v.defaultMoveTiming === "TODAY" ? "TODAY" : d.defaultMoveTiming,
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

type PlayerParse = { player: Player } | { repair: Omit<RepairEntry, "rosterStatus"> } | null;

/** A valid player, a record worth repairing (it has an id), or nothing usable. */
function parsePlayer(v: unknown): PlayerParse {
  if (!isObj(v) || typeof v.id !== "string" || !v.id) return null;
  const rawPositions = Array.isArray(v.eligiblePositions) ? v.eligiblePositions : [];
  const positions = [...new Set(rawPositions.filter((p): p is Position => POSITIONS.includes(p as Position)))];
  const name = typeof v.name === "string" ? v.name.trim() : "";
  const problems: string[] = [];
  if (!name) problems.push("Missing name");
  if (!isNHLTeamId(v.nhlTeamId)) problems.push(`Unknown NHL team${typeof v.nhlTeamId === "string" && v.nhlTeamId ? ` "${v.nhlTeamId}"` : ""}`);
  if (!positions.length) problems.push("No valid positions");
  else if (positions.includes("G") && positions.length > 1) problems.push("Goalie listed with skater positions");

  if (problems.length) {
    return {
      repair: {
        playerId: v.id,
        name: name || "Unnamed player",
        nhlTeamId: typeof v.nhlTeamId === "string" ? v.nhlTeamId : "",
        eligiblePositions: rawPositions.filter((p): p is string => typeof p === "string"),
        problems,
      },
    };
  }
  // NHL identity: current field, or `nhlId` from the first catalog build. Legacy
  // records (including `custom: true`) have neither and become CUSTOM players.
  const rawNhlId = v.nhlPlayerId ?? v.nhlId;
  const nhlPlayerId = typeof rawNhlId === "number" && Number.isInteger(rawNhlId) && rawNhlId > 0 ? rawNhlId : null;
  return {
    player: {
      id: v.id,
      name,
      nhlTeamId: v.nhlTeamId as Player["nhlTeamId"],
      eligiblePositions: positions,
      ...(typeof v.headshot === "string" && v.headshot ? { headshot: v.headshot } : {}),
      nhlPlayerId,
      source: nhlPlayerId ? "NHL" : "CUSTOM",
    },
  };
}

function parseRosterStatus(v: unknown): RosterStatus {
  return v === "BENCH" || v === "IR_PLUS" ? v : "ACTIVE";
}

function parseRepairEntry(v: unknown): RepairEntry | null {
  if (!isObj(v) || typeof v.playerId !== "string" || !v.playerId) return null;
  return {
    playerId: v.playerId,
    name: str(v.name, "Unnamed player"),
    nhlTeamId: str(v.nhlTeamId, ""),
    eligiblePositions: Array.isArray(v.eligiblePositions) ? v.eligiblePositions.filter((p): p is string => typeof p === "string") : [],
    rosterStatus: v.rosterStatus === null || v.rosterStatus === undefined ? null : parseRosterStatus(v.rosterStatus),
    problems: Array.isArray(v.problems) ? v.problems.filter((p): p is string => typeof p === "string") : [],
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
 * Parse the body shared by every schema version. Invalid records never break
 * the app: transactions and overrides that don't parse are dropped, and
 * malformed players (with their roster status) go to `needsRepair` so the
 * user can fix or remove them.
 */
function parseBody(raw: Obj): Omit<AppState, "version"> {
  const players: Record<string, Player> = {};
  const repairs = new Map<string, RepairEntry>();
  for (const e of Array.isArray(raw.needsRepair) ? raw.needsRepair : []) {
    const r = parseRepairEntry(e);
    if (r) repairs.set(r.playerId, r);
  }
  if (isObj(raw.players)) {
    for (const value of Object.values(raw.players)) {
      const parsed = parsePlayer(value);
      if (!parsed) continue;
      if ("player" in parsed) players[parsed.player.id] = parsed.player;
      else repairs.set(parsed.repair.playerId, { ...parsed.repair, rosterStatus: null });
    }
  }

  const seen = new Set<string>();
  const roster: RosterPlayer[] = [];
  for (const r of Array.isArray(raw.roster) ? raw.roster : []) {
    if (!isObj(r) || typeof r.playerId !== "string" || seen.has(r.playerId)) continue;
    seen.add(r.playerId);
    const status = parseRosterStatus(r.rosterStatus);
    if (players[r.playerId]) roster.push({ playerId: r.playerId, rosterStatus: status });
    else if (repairs.has(r.playerId)) repairs.get(r.playerId)!.rosterStatus = status;
  }

  const list = <T>(v: unknown, f: (x: unknown) => T | null) =>
    (Array.isArray(v) ? v : []).map(f).filter((x): x is T => x !== null);

  return {
    settings: parseSettings(raw.settings),
    players,
    roster,
    transactions: list(raw.transactions, parseTransaction),
    overrides: list(raw.overrides, parseOverride),
    setupComplete: raw.setupComplete === true,
    needsRepair: [...repairs.values()],
  };
}

/** Parse a stored v2 state. Returns null when the payload isn't a v2 state at all. */
export function parseAppState(raw: unknown): AppState | null {
  if (!isObj(raw) || raw.version !== APP_STATE_VERSION) return null;
  return { version: APP_STATE_VERSION, ...parseBody(raw) };
}

export type MigrationResult = { state: AppState; removedDemoPlayers: number; keptPlayers: number };

/**
 * Migrate a v1 payload (the alpha build that seeded a sample roster).
 *
 * Only untouched legacy sample players are removed, along with their roster
 * entries, planned moves and overrides. Players the user created, and sample
 * players the user edited, are kept with everything that refers to them.
 * Settings are kept. If no roster is left, setup runs again.
 */
export function migrateV1(raw: unknown): MigrationResult | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const body = parseBody(raw);
  const rawPlayers = isObj(raw.players) ? Object.values(raw.players) : [];
  const demo = new Set(rawPlayers.filter(isUntouchedDemoPlayer).map((p) => (p as { id: string }).id));
  const keep = (id?: string) => !id || !demo.has(id);

  const players = Object.fromEntries(Object.entries(body.players).filter(([id]) => !demo.has(id)));
  const roster = body.roster.filter((r) => !demo.has(r.playerId));
  const transactions = body.transactions.filter((t) => keep(t.addPlayerId) && keep(t.dropPlayerId));
  const overrides = body.overrides.filter((o) => !demo.has(o.playerId));

  return {
    state: {
      version: APP_STATE_VERSION,
      ...body,
      players,
      roster,
      transactions,
      overrides,
      setupComplete: body.setupComplete && roster.length > 0,
    },
    removedDemoPlayers: demo.size,
    keptPlayers: Object.keys(players).length,
  };
}
