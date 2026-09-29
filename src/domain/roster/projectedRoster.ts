import type { ISODate, PlannedTransaction, RosterPlayer } from "../types";

/** Planned, non-cancelled moves effective on or before `date`, in the order they apply. */
export function transactionsInEffect(
  transactions: readonly PlannedTransaction[],
  date: ISODate,
): PlannedTransaction[] {
  return transactions
    .filter((t) => t.status === "PLANNED" && t.effectiveDate <= date)
    .sort(
      (a, b) =>
        a.effectiveDate.localeCompare(b.effectiveDate) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * The roster as it will look on `date` once planned moves are applied.
 * The base roster is never mutated.
 *
 * Adds join as BENCH. The lineup engine starts them whenever they play.
 * In an ADD_DROP, the new player takes the dropped
 * player's place in roster order. The part of a move that can't apply
 * (adding someone already rostered, dropping someone who isn't) is skipped.
 */
export function projectRoster(
  baseRoster: readonly RosterPlayer[],
  transactions: readonly PlannedTransaction[],
  date: ISODate,
): RosterPlayer[] {
  let roster = baseRoster.map((r) => ({ ...r }));
  for (const t of transactionsInEffect(transactions, date)) {
    const addId = t.type !== "DROP" ? t.addPlayerId : undefined;
    const dropId = t.type !== "ADD" ? t.dropPlayerId : undefined;
    const has = (id: string) => roster.some((r) => r.playerId === id);

    const dropIndex = dropId ? roster.findIndex((r) => r.playerId === dropId) : -1;
    const canAdd = !!addId && !has(addId);

    if (dropIndex >= 0 && canAdd) {
      roster[dropIndex] = { playerId: addId!, rosterStatus: "BENCH" };
      continue;
    }
    if (dropIndex >= 0) roster = roster.filter((_, i) => i !== dropIndex);
    if (canAdd) roster.push({ playerId: addId!, rosterStatus: "BENCH" });
  }
  return roster;
}
