import { canPlaySlot } from "../config";
import type { Position, Slot } from "../types";

export type AssignmentCandidate = {
  playerId: string;
  positions: readonly Position[];
};

/**
 * Assign candidates to slots so the number of filled slots is maximal.
 *
 * This is a bipartite maximum matching (Kuhn's augmenting-path algorithm).
 * Candidates are processed in priority order, and a matched candidate is
 * never unmatched by a later augmenting path. Among all maximum
 * assignments, that makes the set of starters lexicographically best by
 * priority. Slot order is fixed and UTIL is tried last, so the result is
 * deterministic.
 *
 * `blockedSlots` are already taken (for example by user overrides) and are
 * skipped.
 *
 * Returns slotId → playerId.
 */
export function assignMaximumStarts(
  candidates: readonly AssignmentCandidate[],
  slots: readonly Slot[],
  blockedSlots: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const freeSlots = slots.filter((s) => !blockedSlots.has(s.id));
  const options: Slot[][] = candidates.map((c) => {
    const eligible = freeSlots.filter((s) => canPlaySlot(c.positions, s.type));
    // Specific-position slots first, UTIL last, so UTIL stays open for flexibility.
    return [...eligible.filter((s) => s.type !== "UTIL"), ...eligible.filter((s) => s.type === "UTIL")];
  });

  const owner = new Map<string, number>(); // slotId → candidate index

  const tryAssign = (i: number, visited: Set<string>): boolean => {
    for (const slot of options[i]) {
      if (visited.has(slot.id)) continue;
      visited.add(slot.id);
      const current = owner.get(slot.id);
      if (current === undefined || tryAssign(current, visited)) {
        owner.set(slot.id, i);
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < candidates.length; i++) tryAssign(i, new Set());

  const result = new Map<string, string>();
  for (const slot of slots) {
    const i = owner.get(slot.id);
    if (i !== undefined) result.set(slot.id, candidates[i].playerId);
  }
  return result;
}
