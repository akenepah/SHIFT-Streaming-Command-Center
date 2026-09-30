import { describe, expect, it } from "vitest";
import { dropImpact } from "./dropImpact";
import { createInitialState } from "@/state/appState";
import { reducer } from "@/state/reducer";
import { moveProblems } from "../transactions/transactions";
import type { PlannedTransaction } from "../types";
const move: PlannedTransaction = { id: "move", type: "DROP", dropPlayerId: "p", effectiveDate: "2026-10-02", createdAt: "2026-09-29T00:00:00Z", status: "PLANNED" };
describe("roster drop consequences", () => {
  it("warns for add and drop references, including retained earlier plans", () => {
    expect(dropImpact("p", [move, { ...move, id: "add", type: "ADD", dropPlayerId: undefined, addPlayerId: "p", effectiveDate: "2026-09-01" }], [], "2026-09-29").moves).toHaveLength(2);
  });
  it("ignores cancelled and unrelated plans and past daily overrides", () => {
    expect(dropImpact("p", [{ ...move, status: "CANCELLED" }, { ...move, dropPlayerId: "q" }], [{ date: "2026-09-28", playerId: "p", targetSlotId: "BN" }], "2026-09-29")).toEqual({ moves: [], dates: [] });
  });
  it("lists distinct affected lineup dates in order", () => {
    const overrides = ["2026-10-03", "2026-09-29", "2026-10-03"].map(date => ({ date, playerId: "p", targetSlotId: "C1" }));
    expect(dropImpact("p", [], overrides, "2026-09-29").dates).toEqual(["2026-09-29", "2026-10-03"]);
  });
  it("drop anyway retains the move and exposes its repair reason", () => {
    const state = createInitialState();
    state.roster = [{ playerId: "p", rosterStatus: "ACTIVE" }]; state.transactions = [move];
    const after = reducer(state, { type: "roster/drop", playerId: "p" });
    expect(after.transactions).toEqual([move]);
    expect(moveProblems({ baseRoster: after.roster, transactions: after.transactions, weeklyAcquisitionLimit: 6, weekStartsOn: 1 }).get("move")).toContain("isn't on your roster");
  });
});
