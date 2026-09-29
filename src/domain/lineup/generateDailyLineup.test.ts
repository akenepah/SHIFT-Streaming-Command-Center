import { describe, expect, it } from "vitest";
import { DEFAULT_ROSTER_CONFIGURATION } from "../config";
import { game, player, playerMap, rostered, schedule, slotsConfig } from "../testing/fixtures";
import type { DailyLineup } from "../types";
import { generateDailyLineup } from "./generateDailyLineup";

const DATE = "2026-10-13";

function startersBySlot(day: DailyLineup): Record<string, string | null> {
  return Object.fromEntries(day.activeSlots.map((a) => [a.slot.id, a.playerId]));
}
function ids(entries: { playerId: string }[]) {
  return entries.map((e) => e.playerId);
}

describe("generateDailyLineup", () => {
  const sched = schedule([game(DATE, "NYR", "BOS"), game(DATE, "EDM", "TOR")]);

  it("puts a player with no NHL game in noGame without using a slot", () => {
    const players = playerMap(player("idle", "ANA", "C"));
    const day = generateDailyLineup({
      roster: [rostered("idle")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1 }),
    });
    expect(ids(day.noGame)).toEqual(["idle"]);
    expect(day.activeSlots.every((a) => a.playerId === null)).toBe(true);
    expect(day.benchedGames).toEqual([]);
  });

  it("starts a playing player when a legal slot is open, with opponent and home/away", () => {
    const players = playerMap(player("bos", "BOS", "C"));
    const day = generateDailyLineup({
      roster: [rostered("bos", "BENCH")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1 }),
    });
    expect(startersBySlot(day)).toEqual({ C1: "bos" });
    expect(day.activeSlots[0].game).toMatchObject({ opponent: "NYR", isHome: true });
  });

  it("puts a playing player with no legal capacity in benchedGames", () => {
    const players = playerMap(player("a", "BOS", "C"), player("b", "NYR", "C"));
    const day = generateDailyLineup({
      roster: [rostered("a"), rostered("b")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1, RW: 1 }),
    });
    expect(startersBySlot(day)).toEqual({ C1: "a", RW1: null });
    expect(ids(day.benchedGames)).toEqual(["b"]);
    expect(day.benchedGames[0].game).toMatchObject({ opponent: "BOS", isHome: false });
  });

  it("never starts an IR+ player, even with a game and an open slot", () => {
    const players = playerMap(player("hurt", "BOS", "C"));
    const day = generateDailyLineup({
      roster: [rostered("hurt", "IR_PLUS")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1 }),
    });
    expect(ids(day.irPlus)).toEqual(["hurt"]);
    expect(day.irPlus[0].game).not.toBeNull();
    expect(startersBySlot(day)).toEqual({ C1: null });
    expect(day.benchedGames).toEqual([]);
  });

  it("lets UTIL accept every skater position", () => {
    for (const pos of ["C", "LW", "RW", "D"] as const) {
      const day = generateDailyLineup({
        roster: [rostered("s")],
        players: playerMap(player("s", "BOS", pos)),
        date: DATE,
        scheduleProvider: sched,
        rosterConfiguration: slotsConfig({ UTIL: 1 }),
      });
      expect(startersBySlot(day)).toEqual({ UTIL1: "s" });
    }
  });

  it("keeps goalies out of UTIL", () => {
    const day = generateDailyLineup({
      roster: [rostered("g")],
      players: playerMap(player("g", "BOS", "G")),
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ UTIL: 1 }),
    });
    expect(startersBySlot(day)).toEqual({ UTIL1: null });
    expect(ids(day.benchedGames)).toEqual(["g"]);
  });

  it("uses multi-position eligibility to maximize starts (C/RW + C into C + RW)", () => {
    const players = playerMap(player("A", "BOS", "C", "RW"), player("B", "NYR", "C"));
    const day = generateDailyLineup({
      roster: [rostered("A"), rostered("B")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1, RW: 1 }),
    });
    expect(startersBySlot(day)).toEqual({ C1: "B", RW1: "A" });
    expect(day.benchedGames).toEqual([]);
  });

  it("maximizes starts through chained reassignments", () => {
    // Only C/LW → LW, LW/RW → RW, C → C starts all three. Roster order is the worst case for first-fit.
    const players = playerMap(
      player("cl", "BOS", "C", "LW"),
      player("lr", "NYR", "LW", "RW"),
      player("c", "EDM", "C"),
    );
    const day = generateDailyLineup({
      roster: [rostered("cl"), rostered("lr"), rostered("c")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1, LW: 1, RW: 1 }),
    });
    expect(day.benchedGames).toEqual([]);
    expect(startersBySlot(day)).toEqual({ C1: "c", LW1: "cl", RW1: "lr" });
  });

  it("respects active slot limits", () => {
    const players = playerMap(
      player("c1", "BOS", "C"),
      player("c2", "NYR", "C"),
      player("c3", "EDM", "C"),
      player("c4", "TOR", "C"),
    );
    const day = generateDailyLineup({
      roster: ["c1", "c2", "c3", "c4"].map((id) => rostered(id)),
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 2, UTIL: 1 }),
    });
    const filled = day.activeSlots.filter((a) => a.playerId);
    expect(filled).toHaveLength(3);
    expect(new Set(filled.map((a) => a.playerId)).size).toBe(3);
    expect(ids(day.benchedGames)).toEqual(["c4"]);
  });

  it("gives ACTIVE-status players priority over BENCH when capacity is short", () => {
    const players = playerMap(player("benchFirst", "BOS", "C"), player("active", "NYR", "C"));
    const day = generateDailyLineup({
      roster: [rostered("benchFirst", "BENCH"), rostered("active", "ACTIVE")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1 }),
    });
    expect(startersBySlot(day)).toEqual({ C1: "active" });
    expect(ids(day.benchedGames)).toEqual(["benchFirst"]);
  });

  it("reports unused active slots as open slots", () => {
    const players = playerMap(player("c", "BOS", "C"), player("d", "NYR", "D"), player("off", "ANA", "RW"));
    const day = generateDailyLineup({
      roster: [rostered("c"), rostered("d"), rostered("off")],
      players,
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: slotsConfig({ C: 1, RW: 1, D: 2, UTIL: 1, G: 1 }),
    });
    expect(day.openSlots.map((s) => s.id)).toEqual(["RW1", "D2", "UTIL1", "G1"]);
    expect(ids(day.noGame)).toEqual(["off"]);
  });

  it("changes derived games when a player's NHL team changes", () => {
    const before = generateDailyLineup({
      roster: [rostered("p")],
      players: playerMap(player("p", "ANA", "C")),
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
    });
    expect(ids(before.noGame)).toEqual(["p"]);

    const after = generateDailyLineup({
      roster: [rostered("p")],
      players: playerMap(player("p", "NYR", "C")),
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
    });
    expect(after.noGame).toEqual([]);
    expect(after.activeSlots.find((a) => a.playerId === "p")?.game).toMatchObject({ opponent: "BOS", isHome: false });
  });

  it("counts NHL games for the date from the schedule provider", () => {
    const day = generateDailyLineup({
      roster: [],
      players: {},
      date: DATE,
      scheduleProvider: sched,
      rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
    });
    expect(day.nhlGameCount).toBe(2);
  });
});
