import { describe, expect, it } from "vitest";
import { DEFAULT_LEAGUE_SETTINGS } from "./config";
import { generateDailyLineup } from "./lineup/generateDailyLineup";
import { validateSettings } from "./settings";
import { game, player, playerMap, rostered, schedule } from "./testing/fixtures";

describe("league settings", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(DEFAULT_LEAGUE_SETTINGS)).toEqual([]);
  });

  it("rejects no active slots and bad numbers", () => {
    const s = structuredClone(DEFAULT_LEAGUE_SETTINGS);
    s.roster.slots = { C: 0, LW: 0, RW: 0, D: 0, UTIL: 0, G: 0 };
    s.weeklyAcquisitionLimit = 2.5;
    expect(validateSettings(s)).toEqual(expect.arrayContaining(["Add at least one active lineup slot.", "Weekly acquisition limit must be a whole number from 0 to 50.", "Add a G slot or set minimum goalie appearances to None."]));
  });

  it("changing slot configuration changes the generated lineup", () => {
    const date = "2026-10-13";
    const input = {
      roster: [rostered("a"), rostered("b")],
      players: playerMap(player("a", "BOS", "C"), player("b", "NYR", "C")),
      date,
      scheduleProvider: schedule([game(date, "NYR", "BOS")]),
    };
    const one = generateDailyLineup({ ...input, rosterConfiguration: { ...DEFAULT_LEAGUE_SETTINGS.roster, slots: { ...DEFAULT_LEAGUE_SETTINGS.roster.slots, C: 1, UTIL: 0 } } });
    expect(one.benchedGames).toHaveLength(1);
    const two = generateDailyLineup({ ...input, rosterConfiguration: { ...DEFAULT_LEAGUE_SETTINGS.roster, slots: { ...DEFAULT_LEAGUE_SETTINGS.roster.slots, C: 2, UTIL: 0 } } });
    expect(two.benchedGames).toHaveLength(0);
  });
});
