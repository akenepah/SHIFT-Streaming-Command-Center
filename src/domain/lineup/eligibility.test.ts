import { describe, expect, it } from "vitest";
import { game, player, playerMap, rostered, schedule, slotsConfig } from "../testing/fixtures";
import type { DailyLineup } from "../types";
import { generateDailyLineup } from "./generateDailyLineup";

/** Fantasy eligibility (dual / tri position) drives legality through maximum matching, never greedy order. */
const DATE = "2026-10-13";
const sched = schedule([game(DATE, "PIT", "BOS"), game(DATE, "EDM", "TOR"), game(DATE, "NYR", "CAR")]);
const bySlot = (d: DailyLineup) => Object.fromEntries(d.activeSlots.map((a) => [a.slot.id, a.playerId]));
const starters = (d: DailyLineup) => d.activeSlots.filter((a) => a.playerId).map((a) => a.playerId);

describe("fantasy position eligibility in the lineup engine", () => {
  it("C/RW + C-only into C + RW: both start, regardless of roster order", () => {
    const players = playerMap(player("a", "PIT", "C", "RW"), player("b", "BOS", "C"));
    for (const roster of [[rostered("a"), rostered("b")], [rostered("b"), rostered("a")]]) {
      const day = generateDailyLineup({ roster, players, date: DATE, scheduleProvider: sched, rosterConfiguration: slotsConfig({ C: 1, RW: 1 }) });
      expect(bySlot(day)).toEqual({ C1: "b", RW1: "a" });
    }
  });

  it("tri-position C/LW/RW player yields to constrained players", () => {
    const players = playerMap(player("tri", "PIT", "C", "LW", "RW"), player("c", "BOS", "C"), player("lw", "EDM", "LW"));
    const day = generateDailyLineup({
      roster: [rostered("tri"), rostered("c"), rostered("lw")],
      players, date: DATE, scheduleProvider: sched, rosterConfiguration: slotsConfig({ C: 1, LW: 1, RW: 1 }),
    });
    expect(bySlot(day)).toEqual({ C1: "c", LW1: "lw", RW1: "tri" });
    expect(day.benchedGames).toEqual([]);
  });

  it("UTIL accepts any skater (incl. D) but never a goalie; no player is assigned twice", () => {
    const players = playerMap(player("d1", "PIT", "D"), player("d2", "BOS", "D"), player("g", "EDM", "G"), player("w", "TOR", "LW", "RW"));
    const day = generateDailyLineup({
      roster: [rostered("d1"), rostered("d2"), rostered("g"), rostered("w")],
      players, date: DATE, scheduleProvider: sched, rosterConfiguration: slotsConfig({ D: 1, UTIL: 1, LW: 1 }),
    });
    expect(starters(day).sort()).toEqual(["d1", "d2", "w"]);
    expect(new Set(starters(day)).size).toBe(starters(day).length);
    expect(day.activeSlots.find((a) => a.slot.type === "UTIL")?.playerId).not.toBe("g");
    expect(day.benchedGames.map((b) => b.playerId)).toEqual(["g"]);
  });

  it("maximizes starts through a dual-position chain when greedy order would fail", () => {
    // Greedy (roster order) would put lwrw in LW and strand lw; matching moves lwrw to RW.
    const players = playerMap(player("lwrw", "PIT", "LW", "RW"), player("lw", "BOS", "LW"), player("crw", "EDM", "C", "RW"), player("c", "NYR", "C"));
    const day = generateDailyLineup({
      roster: ["lwrw", "lw", "crw", "c"].map((id) => rostered(id)),
      players, date: DATE, scheduleProvider: sched, rosterConfiguration: slotsConfig({ C: 1, LW: 1, RW: 1, UTIL: 1 }),
    });
    expect(starters(day)).toHaveLength(4);
    expect(day.benchedGames).toEqual([]);
  });
});
