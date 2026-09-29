import { describe, expect, it } from "vitest";
import { rostered, tx } from "../testing/fixtures";
import { projectRoster } from "./projectedRoster";

const base = [rostered("mctavish"), rostered("keller", "BENCH")];
const ids = (r: { playerId: string }[]) => r.map((x) => x.playerId);

describe("projectRoster", () => {
  it("applies a planned add on its effective date", () => {
    const t = [tx({ type: "ADD", addPlayerId: "aho", effectiveDate: "2026-10-15" })];
    expect(ids(projectRoster(base, t, "2026-10-15"))).toEqual(["mctavish", "keller", "aho"]);
    expect(projectRoster(base, t, "2026-10-15")[2].rosterStatus).toBe("BENCH");
  });

  it("does not apply a planned add before its effective date", () => {
    const t = [tx({ type: "ADD", addPlayerId: "aho", effectiveDate: "2026-10-15" })];
    expect(ids(projectRoster(base, t, "2026-10-14"))).toEqual(["mctavish", "keller"]);
  });

  it("applies a planned drop on its effective date", () => {
    const t = [tx({ type: "DROP", dropPlayerId: "mctavish", effectiveDate: "2026-10-15" })];
    expect(ids(projectRoster(base, t, "2026-10-14"))).toEqual(["mctavish", "keller"]);
    expect(ids(projectRoster(base, t, "2026-10-15"))).toEqual(["keller"]);
  });

  it("replaces the dropped player in place for add + drop", () => {
    const t = [tx({ type: "ADD_DROP", addPlayerId: "aho", dropPlayerId: "mctavish", effectiveDate: "2026-10-15" })];
    expect(ids(projectRoster(base, t, "2026-10-16"))).toEqual(["aho", "keller"]);
  });

  it("ignores cancelled moves", () => {
    const t = [tx({ type: "ADD_DROP", addPlayerId: "aho", dropPlayerId: "mctavish", effectiveDate: "2026-10-15", status: "CANCELLED" })];
    expect(ids(projectRoster(base, t, "2026-10-20"))).toEqual(["mctavish", "keller"]);
  });

  it("never mutates the base roster", () => {
    const copy = structuredClone(base);
    projectRoster(base, [tx({ type: "DROP", dropPlayerId: "keller", effectiveDate: "2026-10-01" })], "2026-10-02");
    expect(base).toEqual(copy);
  });

  it("skips impossible parts of a move safely", () => {
    const t = [
      tx({ type: "ADD", addPlayerId: "keller", effectiveDate: "2026-10-01" }), // already rostered
      tx({ type: "DROP", dropPlayerId: "ghost", effectiveDate: "2026-10-01" }), // not rostered
    ];
    expect(ids(projectRoster(base, t, "2026-10-02"))).toEqual(["mctavish", "keller"]);
  });
});
