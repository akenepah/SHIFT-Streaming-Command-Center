import { addDays, startOfWeek } from "../dates";
import { projectRoster } from "../roster/projectedRoster";
import type { ISODate, PlannedTransaction, RosterPlayer, TransactionType } from "../types";

/** Acquisitions a move uses: ADD and ADD_DROP use 1, DROP uses 0. */
export function acquisitionCost(type: TransactionType): number {
  return type === "DROP" ? 0 : 1;
}

/** Acquisitions used by planned moves effective within the fantasy week that starts on `weekStart`. */
export function acquisitionsUsed(transactions: readonly PlannedTransaction[], weekStart: ISODate): number {
  const weekEnd = addDays(weekStart, 6);
  return transactions
    .filter((t) => t.status === "PLANNED" && t.effectiveDate >= weekStart && t.effectiveDate <= weekEnd)
    .reduce((n, t) => n + acquisitionCost(t.type), 0);
}

export type TransactionDraft = {
  type: TransactionType;
  addPlayerId?: string;
  dropPlayerId?: string;
  effectiveDate: ISODate;
};

export type TransactionContext = {
  baseRoster: readonly RosterPlayer[];
  transactions: readonly PlannedTransaction[];
  weeklyAcquisitionLimit: number;
  weekStartsOn: number;
  /** When editing, the id of the move being replaced (it's left out of the checks). */
  editingId?: string;
  /** Active + bench spots. When set, a move may not push the non-IR+ roster over it. */
  regularCapacity?: number;
};

export type DraftCheck = {
  errors: string[];
  warnings: string[];
};

/** Validate a draft against the roster projected for its effective date. */
export function checkDraft(draft: TransactionDraft, ctx: TransactionContext): DraftCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const others = ctx.transactions.filter((t) => t.id !== ctx.editingId);

  if (!draft.effectiveDate) errors.push("Choose an effective date.");
  const needsAdd = draft.type !== "DROP";
  const needsDrop = draft.type !== "ADD";
  if (needsAdd && !draft.addPlayerId) errors.push("Choose a player to add.");
  if (needsDrop && !draft.dropPlayerId) errors.push("Choose a player to drop.");
  if (errors.length) return { errors, warnings };

  const rosterThen = projectRoster(ctx.baseRoster, others, draft.effectiveDate);
  const onRoster = (id?: string) => !!id && rosterThen.some((r) => r.playerId === id);
  if (needsAdd && onRoster(draft.addPlayerId)) errors.push("That player is already on your roster on this date.");
  if (needsDrop && !onRoster(draft.dropPlayerId)) errors.push("That player isn't on your roster on this date.");

  if (ctx.regularCapacity !== undefined && !errors.length) {
    // IR+ is separate capacity: dropping an IR+ player doesn't make room for an add.
    const regular = (r: readonly RosterPlayer[]) => r.filter((x) => x.rosterStatus !== "IR_PLUS").length;
    const before = regular(rosterThen);
    const after = regular(projectRoster(rosterThen, [createTransaction(draft, "__check__", new Date(0))], draft.effectiveDate));
    if (after > ctx.regularCapacity && after > before) {
      const droppedIr = needsDrop && rosterThen.some((r) => r.playerId === draft.dropPlayerId && r.rosterStatus === "IR_PLUS");
      errors.push(
        droppedIr
          ? `Your roster is full (${before} / ${ctx.regularCapacity}). Dropping an IR+ player doesn't free a roster spot. Drop an Active or Bench player.`
          : `Your roster is full (${before} / ${ctx.regularCapacity}). Use Add + Drop.`,
      );
    }
  }

  if (acquisitionCost(draft.type) > 0) {
    const weekStart = startOfWeek(draft.effectiveDate, ctx.weekStartsOn);
    const used = acquisitionsUsed(others, weekStart) + 1;
    if (used > ctx.weeklyAcquisitionLimit)
      warnings.push(`This would use ${used} of ${ctx.weeklyAcquisitionLimit} acquisitions for that week.`);
  }
  return { errors, warnings };
}

export function createTransaction(draft: TransactionDraft, id: string, now: Date = new Date()): PlannedTransaction {
  return {
    id,
    type: draft.type,
    addPlayerId: draft.type !== "DROP" ? draft.addPlayerId : undefined,
    dropPlayerId: draft.type !== "ADD" ? draft.dropPlayerId : undefined,
    effectiveDate: draft.effectiveDate,
    status: "PLANNED",
    createdAt: now.toISOString(),
  };
}

export function updateTransaction(
  transactions: readonly PlannedTransaction[],
  id: string,
  draft: TransactionDraft,
): PlannedTransaction[] {
  return transactions.map((t) =>
    t.id === id
      ? {
          ...t,
          type: draft.type,
          addPlayerId: draft.type !== "DROP" ? draft.addPlayerId : undefined,
          dropPlayerId: draft.type !== "ADD" ? draft.dropPlayerId : undefined,
          effectiveDate: draft.effectiveDate,
        }
      : t,
  );
}

export function cancelTransaction(transactions: readonly PlannedTransaction[], id: string): PlannedTransaction[] {
  return transactions.map((t) => (t.id === id ? { ...t, status: "CANCELLED" } : t));
}

/** Undo a cancellation (the record is kept, so this is exact). */
export function restoreTransaction(transactions: readonly PlannedTransaction[], id: string): PlannedTransaction[] {
  return transactions.map((t) => (t.id === id ? { ...t, status: "PLANNED" } : t));
}

/** Planned (non-cancelled) moves effective within the given week, ordered by date. */
export function movesForWeek(transactions: readonly PlannedTransaction[], weekStart: ISODate): PlannedTransaction[] {
  const weekEnd = addDays(weekStart, 6);
  return transactions
    .filter((t) => t.status === "PLANNED" && t.effectiveDate >= weekStart && t.effectiveDate <= weekEnd)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt));
}
