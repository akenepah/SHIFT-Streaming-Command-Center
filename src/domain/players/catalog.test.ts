import { describe, expect, it } from "vitest";
import audit from "@/data/players/2026-27.audit.json";
import raw from "@/data/players/2026-27.json";
import { createInitialState } from "@/state/appState";
import { reducer } from "@/state/reducer";
import { LocalStorageRepository } from "@/state/repository";
import { DEFAULT_ROSTER_CONFIGURATION } from "../config";
import { generateWeek } from "../lineup/generateWeek";
import { isNHLTeamId } from "../nhl/teamIds";
import { StaticScheduleProvider } from "../schedule/staticProvider";
import { POSITIONS, type Position } from "../types";
import { CATALOG_META, CATALOG_PLAYERS, catalogPlayerId, searchPlayers, withCatalog } from "./catalog";

const players = raw.players;
const pool = Object.values(CATALOG_PLAYERS);

describe("bundled player catalog", () => {
  it("has exactly the 250 source players with metadata", () => {
    expect(players).toHaveLength(250);
    expect(raw.meta).toMatchObject({ season: "2026-27", source: "NHL.com Fantasy Top 250", playerCount: 250, sourcePlayerCount: 250 });
    expect(raw.meta.sourceUrl).toMatch(/^https:\/\/www\.nhl\.com\//);
    expect(CATALOG_META.playerCount).toBe(250);
  });

  it("has unique NHL ids, valid teams, positions and NHL headshots", () => {
    expect(new Set(players.map((p) => p.nhlId)).size).toBe(250);
    for (const p of players) {
      expect(Number.isInteger(p.nhlId), p.name).toBe(true);
      expect(isNHLTeamId(p.nhlTeamId), `${p.name} ${p.nhlTeamId}`).toBe(true);
      expect(POSITIONS.includes(p.position as Position), p.name).toBe(true);
      expect(p.headshot, p.name).toMatch(/^https:\/\/assets\.nhle\.com\/mugs\/nhl\/\d{8}\/[A-Z]{3}\/\d+\.png$/);
      expect(p.name).toBe(`${p.firstName} ${p.lastName}`);
    }
    expect(Object.keys(CATALOG_PLAYERS)).toHaveLength(250);
  });

  it("stores membership only: no rank, analysis or projection fields, sorted by last name", () => {
    const keys = new Set(players.flatMap((p) => Object.keys(p)));
    expect([...keys].sort()).toEqual(["firstName", "headshot", "isActive", "lastName", "name", "nhlId", "nhlTeamId", "position"]);
    const lastNames = players.map((p) => p.lastName);
    expect(lastNames).toEqual([...lastNames].sort((a, b) => a.localeCompare(b)));
  });

  it("has a resolution audit entry for every source player", () => {
    expect(audit.entries).toHaveLength(250);
    expect(audit.meta.statusCounts).toEqual({ resolved: 250 });
    const audited = new Set(audit.entries.map((e) => e.nhlId));
    expect(players.every((p) => audited.has(p.nhlId))).toBe(true);
  });
});

describe("catalog players in the app", () => {
  it("maps NHL data to an app player with a stable id", () => {
    expect(CATALOG_PLAYERS[catalogPlayerId(8478402)]).toEqual({
      id: "nhl-8478402",
      name: "Connor McDavid",
      nhlTeamId: "EDM",
      eligiblePositions: ["C"],
      headshot: "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
      nhlId: 8478402,
    });
  });

  it("lets a saved (edited) version override the catalog", () => {
    const edited = { ...CATALOG_PLAYERS["nhl-8478402"], eligiblePositions: ["C" as const, "RW" as const] };
    expect(withCatalog({ [edited.id]: edited })["nhl-8478402"].eligiblePositions).toEqual(["C", "RW"]);
  });
});

describe("searchPlayers", () => {
  it("finds by name prefix, last name and partial, ignoring accents and case", () => {
    expect(searchPlayers("mcdav", pool)[0].name).toBe("Connor McDavid");
    expect(searchPlayers("stutzle", pool)[0].name).toBe("Tim Stützle");
    expect(searchPlayers("SLAFKOVSKY", pool)[0].name).toBe("Juraj Slafkovský");
  });

  it("ranks full-name prefix before last-name matches", () => {
    const names = searchPlayers("connor", pool).map((p) => p.name);
    expect(names[0].startsWith("Connor")).toBe(true);
    expect(names).toContain("Kyle Connor");
    expect(names.indexOf("Kyle Connor")).toBeGreaterThan(names.findIndex((n) => n.startsWith("Connor")));
  });

  it("lists a team's players first for an exact team code, then name matches", () => {
    const teamSize = pool.filter((p) => p.nhlTeamId === "EDM").length;
    const edm = searchPlayers("edm", pool, 50);
    expect(teamSize).toBeGreaterThan(0);
    expect(edm.slice(0, teamSize).every((p) => p.nhlTeamId === "EDM")).toBe(true);
    expect(edm.slice(teamSize).every((p) => p.nhlTeamId !== "EDM")).toBe(true);
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(searchPlayers("  ", pool)).toEqual([]);
    expect(searchPlayers("a", pool, 5)).toHaveLength(5);
  });
});

describe("adding a catalog player", () => {
  it("persists with team, position, headshot and NHL id, and drives the schedule", () => {
    const catalog = CATALOG_PLAYERS["nhl-8478402"];
    let s = reducer(createInitialState(), { type: "player/upsert", player: catalog });
    s = reducer(s, { type: "roster/add", playerId: catalog.id, status: "ACTIVE" });

    const storage = new Map<string, string>();
    const repo = new LocalStorageRepository({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => void storage.set(k, v),
      removeItem: (k) => void storage.delete(k),
    });
    repo.save(s);
    const loaded = repo.load().state;
    expect(loaded.players["nhl-8478402"]).toEqual(catalog);

    const week = generateWeek({
      weekStart: "2026-09-28",
      roster: loaded.roster,
      players: withCatalog(loaded.players),
      scheduleProvider: new StaticScheduleProvider(),
      rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
    });
    expect(week.summary.startsByPlayer["nhl-8478402"]).toBe(3); // EDM: Tue, Thu, Sat
  });

  it("lets a planned Add preview a catalog player that isn't saved yet", () => {
    const week = generateWeek({
      weekStart: "2026-09-28",
      roster: [],
      players: withCatalog({}),
      scheduleProvider: new StaticScheduleProvider(),
      rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION,
      plannedTransactions: [
        { id: "t", type: "ADD", addPlayerId: "nhl-8478402", effectiveDate: "2026-10-01", status: "PLANNED", createdAt: "" },
      ],
    });
    expect(week.summary.startsByPlayer["nhl-8478402"]).toBe(2); // Thu, Sat
  });
});
