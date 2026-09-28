import { describe, expect, it } from "vitest";
import { buildSlots } from "../config";
import { game, player, playerMap, rostered, schedule, slotsConfig } from "../testing/fixtures";
import type { ActiveSlotAssignment } from "../types";
import { benchRows, irPlusRows } from "./dayRows";
import { generateDailyLineup } from "./generateDailyLineup";
import { ACTIVE_SLOT_TYPES, openSlotContext, openSlotEffectiveDate, opportunityTone } from "./openSlot";

const slots = (filled: number, total: number): ActiveSlotAssignment[] =>
  buildSlots(slotsConfig({ C: total })).map((slot, i) => ({
    slot,
    playerId: i < filled ? `p${i}` : null,
    game: null,
    overridden: false,
  }));

describe("open slot context", () => {
  it("records the source, day and position", () => {
    expect(openSlotContext("2026-10-06", "RW")).toEqual({ source: "weekly-planner-open-slot", date: "2026-10-06", position: "RW" });
  });

  it("only offers Add player for active slot types", () => {
    expect(ACTIVE_SLOT_TYPES).toEqual(["C", "LW", "RW", "D", "UTIL", "G"]);
  });

  it("defaults the effective date to the clicked day when league timing allows it", () => {
    const ctx = openSlotContext("2026-10-06", "RW");
    expect(openSlotEffectiveDate(ctx, "NEXT_DAY", "2026-09-28")).toBe("2026-10-06");
    expect(openSlotEffectiveDate(ctx, "TODAY", "2026-10-06")).toBe("2026-10-06");
  });

  it("respects next-day timing: clicking today makes the move effective tomorrow", () => {
    expect(openSlotEffectiveDate(openSlotContext("2026-10-06", "RW"), "NEXT_DAY", "2026-10-06")).toBe("2026-10-07");
    // A day that's already past can't be filled either.
    expect(openSlotEffectiveDate(openSlotContext("2026-10-05", "C"), "NEXT_DAY", "2026-10-06")).toBe("2026-10-07");
  });
});

describe("opportunityTone (low fill = high streaming opportunity)", () => {
  it.each([
    [0, 20, "very-high"],
    [4, 20, "very-high"],
    [5, 20, "strong"],
    [9, 20, "strong"],
    [10, 20, "moderate"],
    [14, 20, "moderate"],
    [15, 20, "limited"],
    [19, 20, "limited"],
    [20, 20, "none"],
  ] as const)("%i of %i filled → %s", (filled, total, tone) => {
    expect(opportunityTone({ activeSlots: slots(filled, total), nhlGameCount: 5 })).toBe(tone);
  });

  it("is neutral with no NHL games or no active slots", () => {
    expect(opportunityTone({ activeSlots: slots(0, 5), nhlGameCount: 0 })).toBe("na");
    expect(opportunityTone({ activeSlots: [], nhlGameCount: 5 })).toBe("na");
  });
});

describe("bench and IR+ rows", () => {
  const DATE = "2026-10-13";
  const sched = schedule([game(DATE, "BOS", "NYR"), game(DATE, "EDM", "TOR")]);
  const players = playerMap(
    player("activeC", "BOS", "C"),
    player("benchStarts", "NYR", "LW"), // bench status, auto-started into LW
    player("benchIdle", "ANA", "C"), // bench status, no game
    player("benchG", "EDM", "G"), // bench status, G slot taken → benched game
    player("activeG", "TOR", "G"),
    player("activeG2", "BOS", "G"), // active, but no G slot left → benched game
    player("hurt", "NYR", "D"),
  );
  const roster = [
    rostered("activeC"),
    rostered("activeG"),
    rostered("activeG2"),
    rostered("benchStarts", "BENCH"),
    rostered("benchIdle", "BENCH"),
    rostered("benchG", "BENCH"),
    rostered("hurt", "IR_PLUS"),
  ];
  const day = generateDailyLineup({ roster, players, date: DATE, scheduleProvider: sched, rosterConfiguration: slotsConfig({ C: 1, LW: 1, G: 1 }) });

  it("shows bench players in roster order, a vacated spot for the auto-started one, benched games, then padding", () => {
    const rows = benchRows(day, 5);
    expect(rows.map((r) => (r.kind === "open" ? "open" : `${r.playerId}${r.benchedGame ? "*" : ""}`))).toEqual([
      "open", // benchStarts is in the lineup today
      "benchIdle",
      "benchG*",
      "activeG2*", // an Active player's benched game is never hidden
      "open",
    ]);
    const idle = rows[1];
    expect(idle.kind === "player" && idle.game).toBeNull();
  });

  it("lists IR+ players (never starting) and pads to capacity", () => {
    const rows = irPlusRows(day, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "player", playerId: "hurt", benchedGame: false });
    expect(rows[0].kind === "player" && rows[0].game?.opponent).toBe("BOS");
    expect(rows.slice(1).every((r) => r.kind === "open")).toBe(true);
    expect(day.activeSlots.some((a) => a.playerId === "hurt")).toBe(false);
  });
});
