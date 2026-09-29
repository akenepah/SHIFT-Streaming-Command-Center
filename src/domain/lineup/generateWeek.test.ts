import { describe, expect, it } from "vitest";
import { game, player, playerMap, rostered, schedule, slotsConfig, tx } from "../testing/fixtures";
import { acquisitionsUsed } from "../transactions/transactions";
import { generateDailyLineup } from "./generateDailyLineup";
import { generateWeek } from "./generateWeek";

const sched = schedule([
  game("2026-10-12", "BOS", "NYR"),
  game("2026-10-14", "BOS", "TOR"),
  game("2026-10-14", "EDM", "CGY"),
  game("2026-10-16", "EDM", "BOS"),
  game("2026-10-19", "BOS", "NYR"), // next week
]);

describe("generateWeek", () => {
  const players = playerMap(player("b", "BOS", "C"), player("e", "EDM", "C"));
  const base = {
    roster: [rostered("b")],
    players,
    scheduleProvider: sched,
    rosterConfiguration: slotsConfig({ C: 1 }),
  };

  it("generates seven days with schedule-derived game counts", () => {
    const week = generateWeek({ ...base, weekStart: "2026-10-12" });
    expect(week.days.map((d) => d.date)).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
    expect(week.days.map((d) => d.nhlGameCount)).toEqual([1, 0, 2, 0, 1, 0, 0]);
    expect(week.summary.gamesStarted).toBe(3);
    expect(week.summary.nhlGames).toBe(4);
  });

  it("recalculates when navigating to another week", () => {
    const next = generateWeek({ ...base, weekStart: "2026-10-19" });
    expect(next.summary.gamesStarted).toBe(1);
    expect(next.days[0].activeSlots[0]).toMatchObject({ playerId: "b", game: { opponent: "NYR", isHome: false } });
  });

  it("applies planned moves only from their effective date", () => {
    const week = generateWeek({
      ...base,
      weekStart: "2026-10-12",
      plannedTransactions: [tx({ type: "ADD_DROP", addPlayerId: "e", dropPlayerId: "b", effectiveDate: "2026-10-15" })],
    });
    const rosterIds = week.days.map((d) => d.roster.map((r) => r.playerId).join());
    expect(rosterIds).toEqual(["b", "b", "b", "e", "e", "e", "e"]);
    // Mon b (BOS), Wed b (BOS); Fri e (EDM @ BOS). Wed EDM game is before the add.
    expect(week.summary.startsByPlayer).toEqual({ b: 2, e: 1 });
  });
});


describe("optional next-week planning boundary", () => {
  it("shows a Monday acquisition only in next week's day and acquisition count", () => {
    const weekStart = "2026-10-12";
    const nextMonday = "2026-10-19";
    const input = { weekStart, roster: [rostered("old")], players: playerMap(player("old", "BOS", "C"), player("new", "BOS", "C")), scheduleProvider: sched, rosterConfiguration: slotsConfig({ C: 1 }) };
    const move = tx({ type: "ADD_DROP", addPlayerId: "new", dropPlayerId: "old", effectiveDate: nextMonday });
    const planned = { ...input, plannedTransactions: [move] };
    const current = generateWeek(planned);
    expect(current).toEqual(generateWeek(input));
    const extraDay = generateDailyLineup({ ...planned, date: nextMonday });
    expect(extraDay.nhlGameCount).toBe(1);
    expect(extraDay.activeSlots[0].playerId).toBe("new");
    expect(acquisitionsUsed([move], weekStart)).toBe(0);
    expect(acquisitionsUsed([move], nextMonday)).toBe(1);
  });
});
