import { normalizeSearchText } from "./validation";
import type { Player, RosterPlayer } from "../types";

export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * One search for every "pick a player" flow: bundled catalog + the user's
 * saved (including manually created) players, in memory.
 *
 * Normalization (search only; display names are untouched): case, accents,
 * apostrophes, periods, hyphens and repeated whitespace are ignored, so
 * "oreilly", "O'Reilly" and "o’reilly" all match.
 *
 * Order: exact full name, full name starts with the query, first or last name
 * starts with it, contains it. Within a tier, players with verified fantasy
 * eligibility come before unverified NHL-position fallbacks (depth players),
 * so "Hughes" lists Jack and Quinn before Cameron; then alphabetical. Never
 * ranked by any fantasy ranking.
 */
export function searchPlayers(query: string, pool: readonly Player[], limit = DEFAULT_SEARCH_LIMIT): Player[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const scored: { p: Player; tier: number; unverified: number; key: string }[] = [];
  for (const p of pool) {
    const name = normalizeSearchText(p.name);
    let tier = -1;
    if (name === q) tier = 0;
    else if (name.startsWith(q)) tier = 1;
    else if (name.split(" ").some((w) => w.startsWith(q))) tier = 2;
    else if (name.includes(q)) tier = 3;
    // Multi-word queries in any order ("hughes jack", "mc david"): every word starts a name word.
    else if (q.includes(" ") && q.split(" ").every((t) => name.split(" ").some((w) => w.startsWith(t)))) tier = 4;
    if (tier >= 0) scored.push({ p, tier, unverified: p.eligibilitySource === "NHL_PRIMARY_FALLBACK" ? 1 : 0, key: name });
  }
  return scored
    .sort((a, b) => a.tier - b.tier || a.unverified - b.unverified || a.key.localeCompare(b.key) || a.p.nhlTeamId.localeCompare(b.p.nhlTeamId) || a.p.id.localeCompare(b.p.id))
    .slice(0, limit)
    .map((x) => x.p);
}

/**
 * Is this player already on the roster? Same entity id, or the same NHL
 * player id (durable identity). Custom/legacy players without an NHL id fall
 * back to a normalized name + team match.
 */
export function isRostered(
  candidate: Player,
  roster: readonly RosterPlayer[],
  players: Readonly<Record<string, Player>>,
): boolean {
  const name = normalizeSearchText(candidate.name);
  return roster.some((r) => {
    if (r.playerId === candidate.id) return true;
    const p = players[r.playerId];
    if (!p) return false;
    if (candidate.nhlPlayerId && p.nhlPlayerId) return candidate.nhlPlayerId === p.nhlPlayerId;
    return normalizeSearchText(p.name) === name && p.nhlTeamId === candidate.nhlTeamId;
  });
}

export type ExistingIdentity =
  | { kind: "catalog"; player: Player }
  | { kind: "custom"; player: Player }
  | null;

/**
 * Before saving a manually created player: is this person already known?
 * A catalog player with the same name is preferred (the user is pointed to
 * them); otherwise a saved custom player with the same name and team.
 * Deterministic exact-normalized matching only.
 */
export function findExistingIdentity(
  name: string,
  team: string,
  pool: readonly Player[],
): ExistingIdentity {
  const q = normalizeSearchText(name);
  if (!q) return null;
  const catalog = pool.find((p) => p.source === "NHL" && normalizeSearchText(p.name) === q);
  if (catalog) return { kind: "catalog", player: catalog };
  const custom = pool.find((p) => p.source !== "NHL" && normalizeSearchText(p.name) === q && p.nhlTeamId === team);
  return custom ? { kind: "custom", player: custom } : null;
}
