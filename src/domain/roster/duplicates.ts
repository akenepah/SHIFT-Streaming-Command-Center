import type { Player, RosterPlayer } from "../types";

/**
 * "  Tim  Stützle " → "tim stutzle", "J.T. Miller" → "jt miller", "O'Reilly" → "oreilly".
 * Accents, case, punctuation and spacing are ignored.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A rostered player with the same normalized name, if any (optionally ignoring one player id). */
export function findRosterDuplicate(
  name: string,
  roster: readonly RosterPlayer[],
  players: Readonly<Record<string, Player>>,
  ignoreId?: string,
): Player | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  for (const r of roster) {
    if (r.playerId === ignoreId) continue;
    const p = players[r.playerId];
    if (p && normalizeName(p.name) === target) return p;
  }
  return undefined;
}
