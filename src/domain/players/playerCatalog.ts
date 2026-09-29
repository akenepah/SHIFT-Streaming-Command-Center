import yahooEligibilityData from "@/data/players/yahoo-eligibility.json";
import listEligibilityData from "@/data/players/eligibility-2026-27.json";
import type { Position } from "../types";
import catalogData from "@/data/players/2026-27.json";
import { NHL_TEAM_IDS, type NHLTeamId } from "../nhl/teamIds";
import { SCHEDULE_DATASET } from "../schedule/staticProvider";
import type { Player } from "../types";
import { validateCatalog, type CatalogPosition } from "./validation";

/**
 * Bundled Player Catalog: read-only NHL reference data shipped with the app
 * (see src/data/players/README.md). Never persisted to user storage and never
 * fetched at runtime.
 */
export type PlayerCatalogEntry = {
  nhlPlayerId: number;
  firstName: string;
  lastName: string;
  fullName: string;
  teamAbbrev: NHLTeamId | null;
  primaryPosition: CatalogPosition;
  headshotUrl: string | null;
  active: boolean;
};

export type PlayerCatalogData = {
  season: string;
  playerCount: number;
  membershipSource: string;
  membershipSourceUrl: string;
  membershipSourcePublishedAt: string | null;
  membershipSourceModifiedAt: string | null;
  generatedAt: string;
  players: PlayerCatalogEntry[];
};

export type LoadedCatalog = { entries: readonly PlayerCatalogEntry[]; error: string | null };

const SCHEDULE_TEAM_IDS = [...new Set(SCHEDULE_DATASET.games.flatMap((g) => [g.homeTeam, g.awayTeam]))];

/**
 * Validate raw catalog data. Invalid data yields an empty catalog and an
 * error instead of throwing, so the planner keeps working and manual player
 * creation stays available. Tests make sure invalid data never ships.
 */
export function loadPlayerCatalog(raw: unknown): LoadedCatalog {
  const errors = validateCatalog(raw, { teamIds: NHL_TEAM_IDS, scheduleTeamIds: SCHEDULE_TEAM_IDS });
  if (errors.length) return { entries: [], error: `Player Catalog is unavailable (${errors.length} data problems).` };
  return { entries: (raw as PlayerCatalogData).players, error: null };
}

const LOADED = loadPlayerCatalog(catalogData);
export const CATALOG_ERROR = LOADED.error;
export const CATALOG_ENTRIES = LOADED.entries;
const BY_NHL_ID = new Map(CATALOG_ENTRIES.map((e) => [e.nhlPlayerId, e]));

export function getCatalogEntry(nhlPlayerId: number): PlayerCatalogEntry | undefined {
  return BY_NHL_ID.get(nhlPlayerId);
}

/** SHIFT's internal entity id for a catalog player; the NHL id stays the durable external identity. */
export function catalogPlayerId(nhlPlayerId: number): string {
  return `nhl-${nhlPlayerId}`;
}

/**
 * The initial roster record for a catalog player. NHL owns identity, team,
 * primary position and headshot; fantasy eligibility starts as the primary
 * position and is the user's to edit. Entries without a current team can't
 * drive a schedule, so they aren't offered.
 */
export function playerFromCatalogEntry(e: PlayerCatalogEntry): Player | null {
  if (!e.teamAbbrev) return null;
  const { eligiblePositions, eligibilitySource, yahooPlayerId } = catalogEligibility(e);
  return {
    id: catalogPlayerId(e.nhlPlayerId),
    name: e.fullName,
    nhlTeamId: e.teamAbbrev,
    eligiblePositions,
    primaryPosition: e.primaryPosition,
    firstName: e.firstName,
    lastName: e.lastName,
    yahooPlayerId,
    eligibilitySource,
    eligibilitySeason: "2026-27",
    active: e.active,
    ...(e.headshotUrl ? { headshot: e.headshotUrl } : {}),
    nhlPlayerId: e.nhlPlayerId,
    source: "NHL",
  };
}

type EligibilityRow = { nhlPlayerId: number; eligiblePositions: Position[]; yahooPlayerId?: string | null; season?: string; eligibilitySeason?: string };
const YAHOO_ELIGIBILITY = new Map(
  (yahooEligibilityData as EligibilityRow[]).filter((r) => r.season === "2026-27").map((r) => [r.nhlPlayerId, r]),
);
const LIST_ELIGIBILITY = new Map(
  (listEligibilityData as { players: EligibilityRow[] }).players.filter((r) => r.eligibilitySeason === "2026-27").map((r) => [r.nhlPlayerId, r]),
);

/**
 * 2026-27 fantasy eligibility, most authoritative first: a verified Yahoo
 * import, then the curated requested-player list (MANUAL), then the NHL
 * primary position as a labeled fallback. Never inferred from the NHL position
 * when a source exists.
 */
export function catalogEligibility(e: Pick<PlayerCatalogEntry, "nhlPlayerId" | "primaryPosition">): {
  eligiblePositions: Position[];
  eligibilitySource: NonNullable<Player["eligibilitySource"]>;
  yahooPlayerId: string | null;
} {
  const yahoo = YAHOO_ELIGIBILITY.get(e.nhlPlayerId);
  if (yahoo) return { eligiblePositions: yahoo.eligiblePositions, eligibilitySource: "YAHOO", yahooPlayerId: yahoo.yahooPlayerId ?? null };
  const listed = LIST_ELIGIBILITY.get(e.nhlPlayerId);
  if (listed) return { eligiblePositions: listed.eligiblePositions, eligibilitySource: "MANUAL", yahooPlayerId: listed.yahooPlayerId ?? null };
  return { eligiblePositions: [e.primaryPosition], eligibilitySource: "NHL_PRIMARY_FALLBACK", yahooPlayerId: null };
}

/** Catalog players as app Players, keyed by internal id. */
export const CATALOG_PLAYERS: Readonly<Record<string, Player>> = Object.fromEntries(
  CATALOG_ENTRIES.map(playerFromCatalogEntry)
    .filter((p): p is Player => p !== null)
    .map((p) => [p.id, p]),
);

/** Every player an id can refer to: the catalog, overridden by the user's saved players. */
export function withCatalog(saved: Readonly<Record<string, Player>>): Record<string, Player> {
  return { ...CATALOG_PLAYERS, ...saved };
}


/**
 * Bring a saved catalog player's fantasy eligibility up to the current catalog
 * unless the user edited it. Catalog-sourced eligibility (YAHOO / MANUAL /
 * NHL fallback) always follows the catalog. Legacy records without a source
 * are upgraded only while they still hold the old default (just the NHL
 * primary position), so older manual edits are never overwritten.
 */
export function refreshCatalogEligibility(player: Player): Player {
  if (player.source !== "NHL" || !player.nhlPlayerId || player.eligibilitySource === "USER") return player;
  const entry = getCatalogEntry(player.nhlPlayerId);
  if (!entry) return player;
  const legacyDefault =
    player.eligibilitySource === undefined &&
    player.eligiblePositions.length === 1 &&
    player.eligiblePositions[0] === entry.primaryPosition;
  if (player.eligibilitySource === undefined && !legacyDefault) return player;
  const current = catalogEligibility(entry);
  return {
    ...player,
    eligiblePositions: current.eligiblePositions,
    eligibilitySource: current.eligibilitySource,
    eligibilitySeason: "2026-27",
    yahooPlayerId: player.yahooPlayerId ?? current.yahooPlayerId,
    primaryPosition: player.primaryPosition ?? entry.primaryPosition,
  };
}
