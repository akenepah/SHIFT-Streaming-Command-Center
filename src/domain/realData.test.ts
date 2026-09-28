/**
 * Real-data QA: the planner run against the bundled 2026–27 NHL schedule.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_ROSTER_CONFIGURATION } from "./config";
import { weekDates } from "./dates";
import { generateDailyLineup } from "./lineup/generateDailyLineup";
import { generateWeek, type WeekInput } from "./lineup/generateWeek";
import { NHL_TEAM_IDS, type NHLTeamId } from "./nhl/teams";
import { SCHEDULE_DATASET, StaticScheduleProvider } from "./schedule/staticProvider";
import { acquisitionsUsed } from "./transactions/transactions";
import type { PlannedTransaction, Player, Position, RosterPlayer, RosterStatus } from "./types";

const provider = new StaticScheduleProvider();
const OPENING_WEEK = "2026-09-28"; // Mon; the season opens Tue Sep 29
const SAT = "2026-10-03"; // 13-game night

const p = (id: string, team: NHLTeamId, ...pos: Position[]): Player => ({ id, name: id, nhlTeamId: team, eligiblePositions: pos });
const on = (id: string, status: RosterStatus = "ACTIVE"): RosterPlayer => ({ playerId: id, rosterStatus: status });

function week(players: Player[], roster: RosterPlayer[] = players.map((x) => on(x.id)), extra: Partial<WeekInput> = {}) {
  return generateWeek({
    weekStart: OPENING_WEEK,
    roster,
    players: Object.fromEntries(players.map((x) => [x.id, x])),
    scheduleProvider: provider,
    rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
    ...extra,
  });
}

/** Where a player shows up each day: "vs X" / "@ X" when they start or are benched, "-" otherwise. */
function playerDays(plan: ReturnType<typeof week>, id: string): string[] {
  return plan.days.map((d) => {
    const g =
      d.activeSlots.find((a) => a.playerId === id)?.game ??
      d.benchedGames.find((b) => b.playerId === id)?.game ??
      d.irPlus.find((e) => e.playerId === id)?.game;
    return g ? `${g.isHome ? "vs" : "@"} ${g.opponent}` : "-";
  });
}

describe("opening week, real schedule", () => {
  it("matches the published schedule for several teams (dates, opponents, home/away, counts)", () => {
    const expected: Partial<Record<NHLTeamId, string[]>> = {
      //    Mon  Tue        Wed        Thu        Fri        Sat        Sun
      CAR: ["-", "vs FLA", "-", "-", "vs WSH", "@ PHI", "-"],
      FLA: ["-", "@ CAR", "-", "@ SJS", "-", "-", "@ ANA"],
      EDM: ["-", "vs VAN", "-", "@ VAN", "-", "vs SEA", "-"],
      NYR: ["-", "@ BOS", "-", "vs TBL", "@ DET", "-", "vs UTA"],
      TOR: ["-", "vs MTL", "vs NYI", "-", "-", "vs OTT", "-"],
      ANA: ["-", "-", "-", "-", "@ VGK", "-", "vs FLA"],
    };
    for (const [team, days] of Object.entries(expected)) {
      const plan = week([p("x", team as NHLTeamId, "C")]);
      expect(playerDays(plan, "x"), team).toEqual(days);
      expect(plan.summary.gamesByPlayer.x, team).toBe(days.filter((d) => d !== "-").length);
    }
  });

  it("derives every team's week exactly from the bundled dataset", () => {
    const dates = weekDates(OPENING_WEEK);
    for (const team of NHL_TEAM_IDS) {
      const raw = SCHEDULE_DATASET.games.filter(
        (g) => dates.includes(g.date) && (g.homeTeam === team || g.awayTeam === team),
      );
      const expected = dates.map((date) => {
        const g = raw.find((x) => x.date === date);
        if (!g) return "-";
        return g.homeTeam === team ? `vs ${g.awayTeam}` : `@ ${g.homeTeam}`;
      });
      expect(playerDays(week([p("x", team, "D")]), "x"), team).toEqual(expected);
    }
  });

  it("computes NHL game density per day and for the week from the dataset", () => {
    const plan = week([]);
    expect(plan.days.map((d) => d.nhlGameCount)).toEqual([0, 5, 3, 8, 5, 13, 5]);
    expect(plan.summary.nhlGames).toBe(39);
    const dates = weekDates(OPENING_WEEK);
    expect(plan.summary.nhlGames).toBe(SCHEDULE_DATASET.games.filter((g) => dates.includes(g.date)).length);
  });
});

describe("rosters of any size", () => {
  it("empty roster: seven days, nothing started, every slot open, no crash", () => {
    const plan = week([]);
    expect(plan.days).toHaveLength(7);
    expect(plan.summary.gamesStarted).toBe(0);
    for (const d of plan.days) {
      expect(d.openSlots).toHaveLength(15);
      expect(d.benchedGames).toEqual([]);
      expect(d.noGame).toEqual([]);
    }
  });

  it("a single player works", () => {
    const plan = week([p("solo", "NYR", "D")]);
    expect(plan.summary.gamesStarted).toBe(4);
    expect(plan.summary.benchedGames).toBe(0);
  });
});

describe("NHL team change", () => {
  it("moves a player's future schedule to the new team with nothing stale left", () => {
    const before = week([p("x", "BOS", "C")]);
    expect(playerDays(before, "x")).toEqual(["-", "vs NYR", "-", "-", "@ WPG", "@ MIN", "-"]);

    const after = week([p("x", "ANA", "C")]);
    expect(playerDays(after, "x")).toEqual(["-", "-", "-", "-", "@ VGK", "-", "vs FLA"]);
    expect(after.days[1].noGame.map((n) => n.playerId)).toEqual(["x"]); // BOS's Tuesday game is gone
  });
});

describe("Benched Games on a heavy night", () => {
  it("starts the maximum number of skaters and benches only the overflow", () => {
    // Seven C-only skaters whose teams all play Saturday (C:3 + UTIL:1 = 4 legal slots)
    // plus two whose teams don't play Saturday.
    const playing: NHLTeamId[] = ["BOS", "CAR", "EDM", "TOR", "PIT", "MTL", "SEA"];
    const players = [
      ...playing.map((t, i) => p(`c${i}`, t, "C")),
      p("idleFla", "FLA", "C"),
      p("idleNyr", "NYR", "C"),
    ];
    const day = week(players).days[5];
    expect(day.date).toBe(SAT);
    const started = day.activeSlots.filter((a) => a.playerId).map((a) => a.slot.type);
    expect(started.sort()).toEqual(["C", "C", "C", "UTIL"]);
    expect(day.benchedGames).toHaveLength(3);
    expect(day.noGame.map((n) => n.playerId).sort()).toEqual(["idleFla", "idleNyr"]);
    expect(day.benchedGames.some((b) => b.playerId.startsWith("idle"))).toBe(false);
  });

  it("uses multi-position eligibility to avoid benching", () => {
    // Four C/LW players + one C, all playing Saturday: C×3, LW×3, UTIL×1 take all five.
    const players = [
      p("a", "BOS", "C", "LW"),
      p("b", "CAR", "C", "LW"),
      p("c", "EDM", "C", "LW"),
      p("d", "TOR", "C", "LW"),
      p("e", "PIT", "C"),
    ];
    const day = week(players).days[5];
    expect(day.benchedGames).toEqual([]);
    expect(day.activeSlots.filter((a) => a.playerId)).toHaveLength(5);
  });
});

describe("Open Slots", () => {
  it("reports only slots that are really empty", () => {
    // Saturday: four C-only skaters fill C1–C3 and UTIL. C is not open; UTIL isn't either.
    const players = ["BOS", "CAR", "EDM", "TOR"].map((t, i) => p(`c${i}`, t as NHLTeamId, "C"));
    const day = week(players).days[5];
    const open = day.openSlots.map((s) => s.type);
    expect(open).not.toContain("C");
    expect(open).not.toContain("UTIL");
    expect(open.filter((t) => t === "D")).toHaveLength(4);
  });

  it("leaves UTIL open when C still has room", () => {
    const day = week([p("c", "BOS", "C")]).days[5];
    const open = day.openSlots.map((s) => s.type);
    expect(open.filter((t) => t === "C")).toHaveLength(2);
    expect(open).toContain("UTIL");
  });

  it("counts three open D slots correctly", () => {
    const day = week([p("d1", "BOS", "D")]).days[5];
    expect(day.openSlots.filter((s) => s.type === "D")).toHaveLength(3);
  });
});

describe("goalies", () => {
  it("only enter G slots, never UTIL, and projected starts match generated starts", () => {
    // G:1. NYR plays Tue/Thu/Fri/Sun; BOS plays Tue/Fri/Sat.
    const players = [p("g1", "NYR", "G"), p("g2", "BOS", "G")];
    const plan = week(players);
    for (const d of plan.days) {
      for (const a of d.activeSlots) {
        if (a.playerId) expect(a.slot.type).toBe("G");
      }
    }
    const gStarts = plan.days.filter((d) => d.activeSlots.some((a) => a.slot.type === "G" && a.playerId)).length;
    expect(plan.summary.goalieStarts).toBe(gStarts);
    // Days with at least one goalie playing: Tue, Thu, Fri, Sat, Sun = 5 starts; Tue and Fri bench one.
    expect(plan.summary.goalieStarts).toBe(5);
    expect(plan.summary.benchedGames).toBe(2);
    // UTIL stayed open all week even though goalies were benched.
    expect(plan.days.every((d) => d.openSlots.some((s) => s.type === "UTIL"))).toBe(true);
  });
});

describe("planned moves on the real schedule", () => {
  const players = [p("keep", "NYR", "D"), p("out", "BOS", "C"), p("in", "ANA", "C"), p("extra", "EDM", "C")];
  const roster = [on("keep"), on("out")];
  const tx = (partial: Partial<PlannedTransaction>): PlannedTransaction => ({
    id: partial.id ?? "t",
    type: "ADD",
    effectiveDate: "2026-10-02",
    status: "PLANNED",
    createdAt: "2026-09-27T00:00:00Z",
    ...partial,
  });

  it("ADD + DROP applies from the effective date only", () => {
    const plan = week(players, roster, {
      plannedTransactions: [tx({ type: "ADD_DROP", addPlayerId: "in", dropPlayerId: "out" })],
    });
    expect(plan.days.map((d) => d.roster.map((r) => r.playerId).join())).toEqual([
      "keep,out", "keep,out", "keep,out", "keep,out", "keep,in", "keep,in", "keep,in",
    ]);
    expect(playerDays(plan, "out")).toEqual(["-", "vs NYR", "-", "-", "-", "-", "-"]);
    expect(playerDays(plan, "in")).toEqual(["-", "-", "-", "-", "@ VGK", "-", "vs FLA"]);
  });

  it("counts ADD and ADD + DROP as acquisitions, DROP as none, and ignores cancelled moves", () => {
    const moves = [
      tx({ id: "a", type: "ADD", addPlayerId: "extra" }),
      tx({ id: "d", type: "DROP", dropPlayerId: "keep" }),
      tx({ id: "ad", type: "ADD_DROP", addPlayerId: "in", dropPlayerId: "out" }),
      tx({ id: "x", type: "ADD", addPlayerId: "zzz", status: "CANCELLED" }),
    ];
    expect(acquisitionsUsed(moves, OPENING_WEEK)).toBe(2);
    const plan = week(players, roster, { plannedTransactions: moves });
    expect(plan.days[4].roster.map((r) => r.playerId).sort()).toEqual(["extra", "in"]);
  });
});

describe("daily override on the real schedule", () => {
  it("moves a multi-position player for one date, and Reset Day restores the baseline", () => {
    // Saturday: C/LW + C-only, C:3 LW:3 → baseline puts both in C slots.
    // Tuesday: only BOS plays of the two.
    const players = [p("multi", "BOS", "C", "LW"), p("center", "CAR", "C")];
    const base = {
      roster: players.map((x) => on(x.id)),
      players: Object.fromEntries(players.map((x) => [x.id, x])),
      scheduleProvider: provider,
      rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
    };
    const slotOf = (d: ReturnType<typeof generateDailyLineup>, id: string) =>
      d.activeSlots.find((a) => a.playerId === id)?.slot.id;

    const auto = generateDailyLineup({ ...base, date: SAT });
    expect(slotOf(auto, "multi")).toMatch(/^C\d$/);

    const overrides = [{ date: SAT, playerId: "multi", targetSlotId: "LW1" }];
    const moved = generateDailyLineup({ ...base, date: SAT, overrides });
    expect(slotOf(moved, "multi")).toBe("LW1");
    expect(slotOf(moved, "center")).toMatch(/^C\d$/);

    // Other dates are unaffected: Tuesday (BOS vs NYR) stays automatic.
    const tue = generateDailyLineup({ ...base, date: "2026-09-29", overrides });
    expect(tue.appliedOverrides).toEqual([]);
    expect(slotOf(tue, "multi")).toBe(slotOf(generateDailyLineup({ ...base, date: "2026-09-29" }), "multi"));

    // Reset Day = no overrides for that date → baseline again.
    const reset = generateDailyLineup({ ...base, date: SAT, overrides: [] });
    expect(slotOf(reset, "multi")).toBe(slotOf(auto, "multi"));
  });
});
