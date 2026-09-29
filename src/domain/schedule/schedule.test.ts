import { describe, expect, it } from "vitest";
import { weekDates } from "../dates";
import { NHL_TEAM_IDS } from "../nhl/teams";
import { findTeamGame } from "./provider";
import { SCHEDULE_DATASET, StaticScheduleProvider } from "./staticProvider";
import { validateSchedule } from "./validate";

const provider = new StaticScheduleProvider();

describe("bundled 2026-27 NHL schedule", () => {
  it("passes validation (teams, dates, home ≠ away, fields, one game per team per day)", () => {
    expect(validateSchedule(SCHEDULE_DATASET)).toEqual([]);
  });

  it("is the complete regular season: 32 teams × 84 games", () => {
    expect(SCHEDULE_DATASET.meta.season).toBe("2026-27");
    expect(SCHEDULE_DATASET.games).toHaveLength(1344);
    for (const team of NHL_TEAM_IDS) {
      expect(provider.getTeamGames(team, "2026-09-01", "2027-05-01"), team).toHaveLength(84);
    }
  });

  it("derives daily game counts that add up to the season total", () => {
    const { regularSeasonStart, regularSeasonEnd } = SCHEDULE_DATASET.meta;
    const byDay = new Map<string, number>();
    for (const g of SCHEDULE_DATASET.games) byDay.set(g.date, (byDay.get(g.date) ?? 0) + 1);
    let total = 0;
    for (const [date, count] of byDay) {
      expect(provider.getGamesForDate(date)).toHaveLength(count);
      total += count;
    }
    expect(total).toBe(1344);
    expect(provider.getGamesForRange(regularSeasonStart, regularSeasonEnd)).toHaveLength(1344);
  });

  it("keeps late games on their NHL calendar date, not the UTC date", () => {
    // LAK @ VGK starts 02:30 UTC on Apr 11 but is listed on Apr 10.
    const game = findTeamGame(provider, "VGK", "2027-04-10");
    expect(game).toMatchObject({ homeTeam: "VGK", awayTeam: "LAK" });
    expect(findTeamGame(provider, "VGK", "2027-04-11")).toBeUndefined();
  });
});

describe("StaticScheduleProvider queries", () => {
  it("returns opening night", () => {
    const games = provider.getGamesForDate("2026-09-29");
    expect(games.length).toBeGreaterThan(0);
    expect(games.every((g) => g.date === "2026-09-29")).toBe(true);
  });

  it("returns nothing outside the season", () => {
    expect(provider.getGamesForDate("2026-08-01")).toEqual([]);
  });

  it("filters range queries inclusively and by team", () => {
    const week = weekDates("2026-10-12");
    const range = provider.getGamesForRange(week[0], week[6]);
    expect(range.every((g) => g.date >= week[0] && g.date <= week[6])).toBe(true);
    expect(range).toHaveLength(week.reduce((n, d) => n + provider.getGamesForDate(d).length, 0));

    const tor = provider.getTeamGames("TOR", week[0], week[6]);
    expect(tor.length).toBeGreaterThan(0);
    expect(tor.every((g) => g.homeTeam === "TOR" || g.awayTeam === "TOR")).toBe(true);
  });
});
