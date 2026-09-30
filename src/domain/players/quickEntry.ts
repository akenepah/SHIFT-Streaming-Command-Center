import type { Player } from "../types";
/** Enter only adds when the displayed search has one unambiguous, available match. */
export function quickEntryCandidate(query: string, results: readonly Player[], isRostered: (p: Player) => boolean): Player | null {
  if (!query.trim() || results.length !== 1 || isRostered(results[0])) return null;
  return results[0];
}
