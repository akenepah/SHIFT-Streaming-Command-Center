import { describe, expect, it } from "vitest";
import { BENCH_TARGET } from "../types";
import { game, player, playerMap, rostered, schedule, slotsConfig } from "../testing/fixtures";
import { generateDailyLineup } from "./generateDailyLineup";
import { placePlannedAddition } from "./placement";
import { openSlotContext } from "./openSlot";

const date = "2026-10-17";
const players = playerMap(player("c", "BOS", "C"), player("flex", "BOS", "C", "RW"), player("g", "BOS", "G"), player("add", "BOS", "C", "RW"));
const base = { date, players, scheduleProvider: schedule([game(date, "BOS", "EDM")]), rosterConfiguration: slotsConfig({ C: 2, RW: 1, G: 1 }) };

describe("planned open-slot placement", () => {
  it("fills the exact clicked slot without shuffling unrelated starters", () => {
    const before = generateDailyLineup({ ...base, roster: [rostered("c"), rostered("g")] });
    const result = placePlannedAddition(before, { ...base, roster: [...before.roster, rostered("add")] }, "add", openSlotContext(date, "C", "C2"));
    expect(result.day.activeSlots.find(a => a.slot.id === "C2")?.playerId).toBe("add");
    expect(result.day.activeSlots.find(a => a.slot.id === "C1")?.playerId).toBe("c");
    expect(result.day.activeSlots.find(a => a.slot.id === "G1")?.playerId).toBe("g");
  });
  it("does not sacrifice a start to force placement", () => {
    const input = { ...base, rosterConfiguration: slotsConfig({ C: 1, RW: 1 }), roster: [rostered("flex")] };
    const before = generateDailyLineup(input);
    // A C-only addition must take C, moving flex to RW to retain two starts.
    const afterInput = { ...input, players: { ...players, add: player("add", "BOS", "C") }, roster: [...input.roster, rostered("add")] };
    const result = placePlannedAddition(before, afterInput, "add", openSlotContext(date, "RW", "RW1"));
    expect(result.day.activeSlots.filter(a => a.playerId)).toHaveLength(2);
    expect(result.overrides).toBeNull();
  });
  it("includes a newly saved catalog player and ignores IR+ or no-game additions", () => {
    const before = generateDailyLineup({ ...base, roster: [rostered("c")] });
    for (const roster of [[...before.roster, rostered("add", "IR_PLUS")], before.roster]) {
      expect(placePlannedAddition(before, { ...base, roster }, "add", openSlotContext(date, "C", "C2")).overrides).toBeNull();
    }
  });
  it("keeps explicit bench choices while filling an open slot", () => {
    const input = { ...base, roster: [rostered("c"), rostered("flex"), rostered("g")], overrides: [{ date, playerId: "flex", targetSlotId: BENCH_TARGET }] };
    const before = generateDailyLineup(input);
    const result = placePlannedAddition(before, { ...input, roster: [...input.roster, rostered("add")] }, "add", openSlotContext(date, "C", "C2"));
    expect(result.day.benchedGames.map(b => b.playerId)).toContain("flex");
    expect(result.day.ignoredOverrides).toEqual([]);
  });
});
