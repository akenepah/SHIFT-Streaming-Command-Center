import { describe, expect, it } from "vitest";
import { DEFAULT_ROSTER_CONFIGURATION } from "../config";
import { player, playerMap, rostered, slotsConfig } from "../testing/fixtures";
import { rosterLayout } from "./rosterLayout";

const ids = (rows: { player: { id: string } | null }[]) => rows.map((r) => r.player?.id ?? null);

describe("rosterLayout", () => {
  it("groups an empty roster into open slots with capacities", () => {
    const groups = rosterLayout([], {}, DEFAULT_ROSTER_CONFIGURATION);
    expect(groups.map((g) => [g.key, g.filled, g.capacity])).toEqual([
      ["FORWARDS", 0, 9],
      ["DEFENSE", 0, 4],
      ["UTILITY", 0, 1],
      ["GOALTENDERS", 0, 1],
      ["BENCH", 0, 5],
      ["IR_PLUS", 0, 4],
    ]);
    expect(groups.every((g) => g.rows.every((r) => r.player === null))).toBe(true);
  });

  it("places Active players by slot using maximum matching, and keeps Bench and IR+ separate", () => {
    const players = playerMap(
      player("cr", "BOS", "C", "RW"),
      player("c", "NYR", "C"),
      player("d", "EDM", "D"),
      player("g", "TOR", "G"),
      player("bn", "SEA", "LW"),
      player("ir", "ANA", "D"),
    );
    const roster = [rostered("cr"), rostered("c"), rostered("d"), rostered("g"), rostered("bn", "BENCH"), rostered("ir", "IR_PLUS")];
    const [fwd, def, util, goal, bench, ir] = rosterLayout(roster, players, slotsConfig({ C: 1, RW: 1, D: 1, UTIL: 1, G: 1 }));
    expect(fwd.rows.map((r) => [r.slot, r.player?.id])).toEqual([
      ["C", "c"],
      ["RW", "cr"],
    ]);
    expect(ids(def.rows)).toEqual(["d"]);
    expect(ids(util.rows)).toEqual([null]);
    expect(ids(goal.rows)).toEqual(["g"]);
    expect(bench.rows.filter((r) => r.player).map((r) => r.player!.id)).toEqual(["bn"]);
    expect(ir.filled).toBe(1);
  });

  it("puts the more flexible player in UTIL when it's a legal swap", () => {
    const players = playerMap(player("conly", "SJS", "C"), player("crw", "SEA", "C", "RW"));
    const [fwd, , util] = rosterLayout([rostered("conly"), rostered("crw")], players, slotsConfig({ C: 1, UTIL: 1 }));
    expect(fwd.rows.map((r) => r.player?.id)).toEqual(["conly"]);
    expect(util.rows.map((r) => r.player?.id)).toEqual(["crw"]);
  });

  it("lists Active players with no free slot alongside the bench as overflow", () => {
    const players = playerMap(player("g1", "BOS", "G"), player("g2", "NYR", "G"));
    const groups = rosterLayout([rostered("g1"), rostered("g2")], players, slotsConfig({ G: 1 }));
    const bench = groups.find((g) => g.key === "BENCH")!;
    expect(bench.rows[0]).toMatchObject({ slot: "BN", overflow: true, player: { id: "g2" } });
  });
});
