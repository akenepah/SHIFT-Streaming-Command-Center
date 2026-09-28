import catalogData from "@/data/players/2026-27.json";
import { isNHLTeamId } from "../nhl/teamIds";
import { normalizeName } from "../roster/duplicates";
import { POSITIONS, type Player, type Position } from "../types";

/**
 * Bundled NHL player catalog (see src/data/players/README.md). Read-only,
 * shipped with the app; the browser never calls an NHL API for it.
 */
export type CatalogPlayer = {
  nhlId: number;
  name: string;
  firstName: string;
  lastName: string;
  nhlTeamId: string;
  position: string;
  headshot: string;
  isActive: boolean;
};

export type CatalogMeta = {
  season: string;
  source: string;
  sourceUrl: string;
  sourceUpdated: string;
  generatedAt: string;
  playerCount: number;
};

const data = catalogData as unknown as { meta: CatalogMeta; players: CatalogPlayer[] };

export const CATALOG_META: CatalogMeta = data.meta;

/** Stable app id for a catalog player. */
export function catalogPlayerId(nhlId: number): string {
  return `nhl-${nhlId}`;
}

export function catalogToPlayer(c: CatalogPlayer): Player | null {
  if (!isNHLTeamId(c.nhlTeamId) || !POSITIONS.includes(c.position as Position)) return null;
  return {
    id: catalogPlayerId(c.nhlId),
    name: c.name,
    nhlTeamId: c.nhlTeamId,
    eligiblePositions: [c.position as Position],
    headshot: c.headshot,
    nhlId: c.nhlId,
  };
}

/** Catalog players as app Players, keyed by id. */
export const CATALOG_PLAYERS: Readonly<Record<string, Player>> = Object.fromEntries(
  data.players
    .map(catalogToPlayer)
    .filter((p): p is Player => p !== null)
    .map((p) => [p.id, p]),
);

/**
 * Everything a player id can refer to: the catalog, overridden by the user's
 * own saved players (which include catalog players they've added or edited).
 */
export function withCatalog(saved: Readonly<Record<string, Player>>): Record<string, Player> {
  return { ...CATALOG_PLAYERS, ...saved };
}

/**
 * Search by name or team code. Case, accents and punctuation are ignored
 * ("stutzle" finds Stützle). Ranking: an exact team code's players, then
 * full-name prefix, word prefix, substring; alphabetical within each tier.
 */
export function searchPlayers(query: string, pool: readonly Player[], limit = 25): Player[] {
  const q = normalizeName(query);
  if (!q) return [];
  const teamCode = query.trim().toUpperCase();
  const isTeam = isNHLTeamId(teamCode);
  const scored: { p: Player; score: number }[] = [];
  for (const p of pool) {
    const name = normalizeName(p.name);
    let score = -1;
    // An exact team code ("EDM") lists that team first; name matches follow.
    if (isTeam && p.nhlTeamId === teamCode) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.split(" ").some((w) => w.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    if (score >= 0) scored.push({ p, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}
