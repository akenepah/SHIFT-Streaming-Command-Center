import { describe, expect, it } from "vitest";
import type { RosterPlayer } from "../types";
import { checkDraft } from "./transactions";

describe("planned moves respect regular roster capacity (IR+ is separate)", () => {
  // 2 regular spots, both used, plus one IR+ player.
  const base: RosterPlayer[] = [
    { playerId: "a", rosterStatus: "ACTIVE" },
    { playerId: "b", rosterStatus: "BENCH" },
    { playerId: "hurt", rosterStatus: "IR_PLUS" },
  ];
  const ctx = { baseRoster: base, transactions: [], weeklyAcquisitionLimit: 6, weekStartsOn: 1, regularCapacity: 2 };
  const date = "2026-10-14";

  it("rejects an Add + Drop that drops an IR+ player to add into a full roster", () => {
    const { errors } = checkDraft({ type: "ADD_DROP", addPlayerId: "new", dropPlayerId: "hurt", effectiveDate: date }, ctx);
    expect(errors.join(" ")).toMatch(/Dropping an IR\+ player doesn't free a roster spot/);
  });

  it("allows an Add + Drop of a regular player, and a plain drop of an IR+ player", () => {
    expect(checkDraft({ type: "ADD_DROP", addPlayerId: "new", dropPlayerId: "b", effectiveDate: date }, ctx).errors).toEqual([]);
    expect(checkDraft({ type: "DROP", dropPlayerId: "hurt", effectiveDate: date }, ctx).errors).toEqual([]);
  });

  it("rejects a plain Add into a full roster; allows it when a spot is open", () => {
    expect(checkDraft({ type: "ADD", addPlayerId: "new", effectiveDate: date }, ctx).errors.join(" ")).toMatch(/Use Add \+ Drop/);
    expect(checkDraft({ type: "ADD", addPlayerId: "new", effectiveDate: date }, { ...ctx, regularCapacity: 3 }).errors).toEqual([]);
  });
});
