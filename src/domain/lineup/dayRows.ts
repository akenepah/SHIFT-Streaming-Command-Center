import type { DailyLineup, PlayerGame } from "../types";

export type ReserveRow =
  /** A rostered player shown in the section (game = today's game, if any). */
  | { kind: "player"; playerId: string; game: PlayerGame | null; benchedGame: boolean; starting?: boolean }
  /** A passive placeholder: capacity not used today (or vacated by an auto-started bench player). */
  | { kind: "open" };

/**
 * Bench rows for one day, derived from the engine's output (never changes it):
 *  - bench-status players in roster order; one the engine started today leaves
 *    a passive open spot, one whose game didn't fit is a benched game, the
 *    rest have no game;
 *  - then Active-status players with a game but no legal slot (a benched game
 *    must never be hidden);
 *  - padded with open placeholders up to bench capacity.
 */
export function benchRows(day: DailyLineup, benchSlots: number): ReserveRow[] {
  const starting = new Set(day.activeSlots.map((a) => a.playerId).filter(Boolean));
  const benched = new Map(day.benchedGames.map((b) => [b.playerId, b.game]));
  const rows: ReserveRow[] = [];
  for (const r of day.roster) {
    if (r.rosterStatus !== "BENCH") continue;
    if (starting.has(r.playerId)) rows.push({ kind: "player", playerId: r.playerId, game: null, benchedGame: false, starting: true });
    else if (benched.has(r.playerId)) rows.push({ kind: "player", playerId: r.playerId, game: benched.get(r.playerId) ?? null, benchedGame: true });
    else rows.push({ kind: "player", playerId: r.playerId, game: null, benchedGame: false });
  }
  for (const r of day.roster) {
    if (r.rosterStatus === "ACTIVE" && benched.has(r.playerId))
      rows.push({ kind: "player", playerId: r.playerId, game: benched.get(r.playerId) ?? null, benchedGame: true });
  }
  while (rows.length < benchSlots) rows.push({ kind: "open" });
  return rows;
}

/** IR+ rows: IR+ players (with today's game for reference; they never start), padded to capacity. */
export function irPlusRows(day: DailyLineup, irPlusSlots: number): ReserveRow[] {
  const rows: ReserveRow[] = day.irPlus.map((e) => ({ kind: "player", playerId: e.playerId, game: e.game, benchedGame: false }));
  while (rows.length < irPlusSlots) rows.push({ kind: "open" });
  return rows;
}
