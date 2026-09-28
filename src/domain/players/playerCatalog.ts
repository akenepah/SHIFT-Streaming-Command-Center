import eligibilityData from "@/data/players/yahoo-eligibility.json";
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
  const enrichment = (eligibilityData as {nhlPlayerId:number; yahooPlayerId:string; eligiblePositions:Position[]; season:string}[]).find(row => row.nhlPlayerId === e.nhlPlayerId && row.season === "2026-27");
  return {
    id: catalogPlayerId(e.nhlPlayerId),
    name: e.fullName,
    nhlTeamId: e.teamAbbrev,
    eligiblePositions: enrichment?.eligiblePositions ?? [e.primaryPosition],
    primaryPosition: e.primaryPosition,
    firstName: e.firstName,
    lastName: e.lastName,
    yahooPlayerId: enrichment?.yahooPlayerId ?? null,
    eligibilitySource: enrichment ? "YAHOO" : "NHL_PRIMARY_FALLBACK",
    eligibilitySeason: "2026-27",
    active: e.active,
    ...(e.headshotUrl ? { headshot: e.headshotUrl } : {}),
    nhlPlayerId: e.nhlPlayerId,
    source: "NHL",
  };
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

