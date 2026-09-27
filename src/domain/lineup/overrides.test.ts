import { describe, expect, it } from "vitest";
import { game, player, playerMap, rostered, schedule, slotsConfig, tx } from "../testing/fixtures";
import { BENCH_TARGET, type DailyLineup, type DailyLineupOverride } from "../types";
import { generateDailyLineup } from "./generateDailyLineup";
import { legalTargets, resetDay, setOverride } from "./overrides";

const DATE = "2026-10-13";
const sched = schedule([game(DATE, "PIT", "BOS"), game(DATE, "EDM", "TOR")]);
const players = playerMap(
  player("malkin", "PIT", "C", "LW", "RW"),
  player("marchand", "BOS", "LW"),
  player("mcdavid", "EDM", "C"),
  player("off", "ANA", "RW"),
);
const base = {
  roster: [rostered("malkin"), rostered("marchand"), rostered("mcdavid")],
  players,
  date: DATE,
  scheduleProvider: sched,
  rosterConfiguration: slotsConfig({ C: 1, LW: 1, RW: 1 }),
};
const bySlot = (d: DailyLineup) => Object.fromEntries(d.activeSlots.map((a) => [a.slot.id, a.playerId]));

describe("daily lineup overrides", () => {
  it("baseline: engine places everyone", () => {
    expect(bySlot(generateDailyLineup(base))).toEqual({ C1: "mcdavid", LW1: "marchand", RW1: "malkin" });
  });

  it("applies an override for that date and re-places everyone else", () => {
    const overrides = [{ date: DATE, playerId: "malkin", targetSlotId: "C1" }];
    const day = generateDailyLineup({ ...base, overrides });
    expect(day.activeSlots.find((a) => a.slot.id === "C1")).toMatchObject({ playerId: "malkin", overridden: true });
    expect(day.appliedOverrides).toEqual(overrides);
    // mcdavid (C only) no longer fits: the user chose that.
    expect(day.benchedGames.map((b) => b.playerId)).toEqual(["mcdavid"]);
    expect(bySlot(day)).toEqual({ C1: "malkin", LW1: "marchand", RW1: null });
  });

  it("only affects its own date", () => {
    const day = generateDailyLineup({ ...base, overrides: [{ date: "2026-10-14", playerId: "malkin", targetSlotId: "C1" }] });
    expect(bySlot(day)).toEqual({ C1: "mcdavid", LW1: "marchand", RW1: "malkin" });
  });

  it("can bench a playing player", () => {
    const day = generateDailyLineup({ ...base, overrides: [{ date: DATE, playerId: "marchand", targetSlotId: BENCH_TARGET }] });
    expect(day.benchedGames.map((b) => b.playerId)).toEqual(["marchand"]);
    // Malkin moves into LW or stays; both of the other players still start.
    expect(day.activeSlots.filter((a) => a.playerId).length).toBe(2);
  });

  it("reset removes the day's overrides and restores the baseline", () => {
    let overrides: DailyLineupOverride[] = setOverride([], { date: DATE, playerId: "malkin", targetSlotId: "C1" });
    overrides = setOverride(overrides, { date: "2026-10-14", playerId: "malkin", targetSlotId: "LW1" });
    overrides = resetDay(overrides, DATE);
    expect(overrides).toEqual([{ date: "2026-10-14", playerId: "malkin", targetSlotId: "LW1" }]);
    expect(bySlot(generateDailyLineup({ ...base, overrides }))).toEqual({ C1: "mcdavid", LW1: "marchand", RW1: "malkin" });
  });

  it("setOverride replaces an earlier override for the same player and date", () => {
    const o = setOverride([{ date: DATE, playerId: "malkin", targetSlotId: "C1" }], {
      date: DATE,
      playerId: "malkin",
      targetSlotId: "LW1",
    });
    expect(o).toEqual([{ date: DATE, playerId: "malkin", targetSlotId: "LW1" }]);
  });

  it("safely ignores stale or invalid overrides", () => {
    const overrides = [
      { date: DATE, playerId: "marchand", targetSlotId: "C1" }, // not eligible
      { date: DATE, playerId: "malkin", targetSlotId: "UTIL1" }, // slot doesn't exist in config
      { date: DATE, playerId: "off", targetSlotId: "RW1" }, // not rostered
      { date: DATE, playerId: "ghost", targetSlotId: "RW1" }, // unknown player
    ];
    const day = generateDailyLineup({ ...base, overrides });
    expect(day.appliedOverrides).toEqual([]);
    expect(day.ignoredOverrides).toHaveLength(4);
    expect(bySlot(day)).toEqual({ C1: "mcdavid", LW1: "marchand", RW1: "malkin" });
  });

  it("ignores an override for a player dropped by a planned move", () => {
    const day = generateDailyLineup({
      ...base,
      plannedTransactions: [tx({ type: "DROP", dropPlayerId: "malkin", effectiveDate: DATE })],
      overrides: [{ date: DATE, playerId: "malkin", targetSlotId: "C1" }],
    });
    expect(day.ignoredOverrides).toHaveLength(1);
    expect(bySlot(day)).toEqual({ C1: "mcdavid", LW1: "marchand", RW1: null });
  });

  it("ignores an override when the player's team no longer plays that day", () => {
    const moved = { ...players, malkin: { ...players.malkin, nhlTeamId: "ANA" as const } };
    const day = generateDailyLineup({ ...base, players: moved, overrides: [{ date: DATE, playerId: "malkin", targetSlotId: "C1" }] });
    expect(day.ignoredOverrides).toHaveLength(1);
    expect(day.noGame.map((n) => n.playerId)).toEqual(["malkin"]);
  });

  it("lists legal move targets for a player", () => {
    const day = generateDailyLineup(base);
    const targets = legalTargets(day, players.malkin);
    expect(targets.map((t) => t.targetSlotId)).toEqual(["C1", "LW1", BENCH_TARGET]);
    expect(targets[0].occupantId).toBe("mcdavid");
    expect(legalTargets(day, players.off)).toEqual([]);
  });
});
