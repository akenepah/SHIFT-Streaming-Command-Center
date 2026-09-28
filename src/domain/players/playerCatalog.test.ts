import { describe, expect, it } from "vitest";
import raw from "@/data/players/2026-27.json";
import { createInitialState } from "@/state/appState";
import { reducer } from "@/state/reducer";
import { LocalStorageRepository, STORAGE_KEY } from "@/state/repository";
import { DEFAULT_ROSTER_CONFIGURATION } from "../config";
import { generateDailyLineup } from "../lineup/generateDailyLineup";
import { generateWeek } from "../lineup/generateWeek";
import { NHL_TEAM_IDS } from "../nhl/teamIds";
import { playerFromDraft } from "../roster/playerDraft";
import { SCHEDULE_DATASET, StaticScheduleProvider } from "../schedule/staticProvider";
import { acquisitionsUsed } from "../transactions/transactions";
import type { PlannedTransaction, Player, RosterPlayer } from "../types";
import {
  CATALOG_ENTRIES,
  CATALOG_ERROR,
  CATALOG_PLAYERS,
  catalogPlayerId,
  getCatalogEntry,
  loadPlayerCatalog,
  playerFromCatalogEntry,
  withCatalog,
  type PlayerCatalogEntry,
} from "./playerCatalog";
import { findExistingIdentity, isRostered, searchPlayers } from "./searchPlayers";
import { normalizeNhlPosition, normalizeSearchText, validateCatalog } from "./validation";

const SCHEDULE_TEAMS = [...new Set(SCHEDULE_DATASET.games.flatMap((g) => [g.homeTeam, g.awayTeam]))];
const OPTS = { teamIds: NHL_TEAM_IDS, scheduleTeamIds: SCHEDULE_TEAMS, expectedCount: raw.playerCount };
const pool = Object.values(CATALOG_PLAYERS);
const provider = new StaticScheduleProvider();
const MCDAVID = catalogPlayerId(8478402);
const names = (ps: Player[]) => ps.map((p) => p.name);

function memoryRepo() {
  const data = new Map<string, string>();
  const repo = new LocalStorageRepository({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  });
  return { data, repo };
}

describe("bundled 2026-27 Player Catalog", () => {
  it("loads without error and has at least 500 entries matching its metadata", () => {
    expect(CATALOG_ERROR).toBeNull();
    expect(raw.players.length).toBeGreaterThanOrEqual(500);
    expect(raw.playerCount).toBe(raw.players.length);
    expect(CATALOG_ENTRIES).toHaveLength(raw.playerCount);
    expect(raw).toMatchObject({
      season: "2026-27",
      membershipSource: expect.stringContaining("NHL active season rosters"),
      membershipSourceUrl: expect.stringMatching(/^https:\/\/api-web\.nhle\.com\//),
    });
  });

  it("passes full validation (ids, identities, names, positions, teams, schedule, headshots)", () => {
    expect(validateCatalog(raw, OPTS)).toEqual([]);
  });

  it("has unique NHL ids and no duplicate normalized identities", () => {
    expect(new Set(raw.players.map((p) => p.nhlPlayerId)).size).toBe(raw.playerCount);
    const identities = raw.players.map((p) => `${normalizeSearchText(p.fullName)}|${p.teamAbbrev}|${p.primaryPosition}`);
    expect(new Set(identities).size).toBe(raw.playerCount);
  });

  it("uses only canonical teams that all appear in the bundled schedule", () => {
    // Requested players without a current NHL team stay listed (teamAbbrev null) but are never offered.
    for (const p of raw.players.filter((x) => x.teamAbbrev !== null)) {
      expect(NHL_TEAM_IDS).toContain(p.teamAbbrev);
      expect(SCHEDULE_TEAMS).toContain(p.teamAbbrev);
    }
  });

  it("stores identity only: no rank, commentary or projection fields", () => {
    const keys = new Set(raw.players.flatMap((p) => Object.keys(p)));
    expect([...keys].sort()).toEqual([
      "active", "firstName", "fullName", "headshotUrl", "lastName", "nhlPlayerId", "primaryPosition", "teamAbbrev",
    ]);
  });

  it("is sorted deterministically by last name, not by any ranking", () => {
    const sorted = [...raw.players].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.nhlPlayerId - b.nhlPlayerId,
    );
    expect(raw.players.map((p) => p.nhlPlayerId)).toEqual(sorted.map((p) => p.nhlPlayerId));
  });
});

describe("position normalization", () => {
  it("maps NHL codes C, L, R, D, G to SHIFT positions", () => {
    expect(["C", "L", "R", "D", "G"].map(normalizeNhlPosition)).toEqual(["C", "LW", "RW", "D", "G"]);
  });

  it("rejects unsupported codes instead of guessing", () => {
    expect(normalizeNhlPosition("F")).toBeNull();
    expect(normalizeNhlPosition("W")).toBeNull();
    expect(normalizeNhlPosition(undefined)).toBeNull();
  });
});

describe("validation catches bad data", () => {
  const good = raw as unknown as { players: PlayerCatalogEntry[]; playerCount: number };
  const withPlayers = (players: unknown[]) => ({ ...good, players, playerCount: players.length });

  it("duplicate NHL ids", () => {
    const dup = withPlayers([...good.players.slice(0, 249), { ...good.players[1], fullName: "Someone Else" }]);
    expect(validateCatalog(dup, OPTS).some((e) => e.includes("duplicate nhlPlayerId"))).toBe(true);
  });

  it("unsupported team codes", () => {
    const bad = withPlayers([{ ...good.players[0], teamAbbrev: "XYZ" }, ...good.players.slice(1)]);
    expect(validateCatalog(bad, OPTS).some((e) => e.includes("unknown team XYZ"))).toBe(true);
  });

  it("unsupported positions", () => {
    const bad = withPlayers([{ ...good.players[0], primaryPosition: "F" }, ...good.players.slice(1)]);
    expect(validateCatalog(bad, OPTS).some((e) => e.includes("unsupported position F"))).toBe(true);
  });

  it("a count other than 250", () => {
    expect(validateCatalog(withPlayers(good.players.slice(0, 249)), OPTS)).toContain(`Expected exactly ${raw.playerCount} players, found 249`);
  });

  it("non-NHL headshot hosts and missing names", () => {
    const bad = withPlayers([{ ...good.players[0], headshotUrl: "https://example.com/x.png", firstName: "" }, ...good.players.slice(1)]);
    const errors = validateCatalog(bad, OPTS);
    expect(errors.some((e) => e.includes("headshotUrl"))).toBe(true);
    expect(errors.some((e) => e.includes("missing firstName"))).toBe(true);
  });

  it("a corrupt catalog fails safely: empty catalog plus an error, no throw", () => {
    expect(loadPlayerCatalog("not json")).toEqual({ entries: [], error: expect.stringContaining("unavailable") });
    expect(loadPlayerCatalog({ players: [{ nhlPlayerId: "x" }], playerCount: 1 }).entries).toEqual([]);
  });
});

describe("catalog players", () => {
  it("supply NHL team, primary position and headshot automatically", () => {
    expect(CATALOG_PLAYERS[MCDAVID]).toMatchObject({
      id: "nhl-8478402",
      name: "Connor McDavid",
      nhlTeamId: "EDM",
      eligiblePositions: ["C"],
      headshot: "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
      nhlPlayerId: 8478402,
      source: "NHL",
    });
    expect(getCatalogEntry(8484801)).toMatchObject({ fullName: "Macklin Celebrini", teamAbbrev: "SJS", primaryPosition: "C" });
  });

  it("use listed fantasy eligibility (NHL position only as a labeled fallback), and it stays editable", () => {
    const lw = getCatalogEntry(8480801)!; // Brady Tkachuk, NHL primary LW; list: C/LW
    const player = playerFromCatalogEntry(lw)!;
    expect(player).toMatchObject({ eligiblePositions: ["C", "LW"], eligibilitySource: "MANUAL" });
    const edited = playerFromDraft(
      { name: player.name, nhlTeamId: player.nhlTeamId, eligiblePositions: ["C", "LW"], headshot: player.headshot ?? "" },
      player.id,
      player,
    );
    expect(edited).toMatchObject({ eligiblePositions: ["C", "LW"], nhlPlayerId: 8480801, source: "NHL" });
  });

  it("render with the fallback avatar when NHL has no headshot", () => {
    const noHeadshot = playerFromCatalogEntry({ ...getCatalogEntry(8478402)!, headshotUrl: null })!;
    expect(noHeadshot.headshot).toBeUndefined();
  });

  it("let a saved (user-edited) version override the bundled entry", () => {
    const edited = { ...CATALOG_PLAYERS[MCDAVID], eligiblePositions: ["C" as const, "RW" as const] };
    expect(withCatalog({ [MCDAVID]: edited })[MCDAVID].eligiblePositions).toEqual(["C", "RW"]);
  });
});

describe("searchPlayers", () => {
  it("finds exact full names and last names, case-insensitively", () => {
    expect(names(searchPlayers("Connor McDavid", pool))).toEqual(["Connor McDavid"]);
    expect(names(searchPlayers("mcdavid", pool))[0]).toBe("Connor McDavid");
    expect(names(searchPlayers("MCDAVID", pool))[0]).toBe("Connor McDavid");
  });

  it("finds by partial first name and partial surname", () => {
    expect(names(searchPlayers("Mack", pool))).toContain("Macklin Celebrini");
    expect(names(searchPlayers("celeb", pool))).toEqual(["Macklin Celebrini"]);
  });

  it("ignores extra whitespace, punctuation, hyphens and diacritics, keeping official spelling", () => {
    expect(names(searchPlayers("   connor    mcdavid  ", pool))).toEqual(["Connor McDavid"]);
    expect(names(searchPlayers("oreilly", pool))).toEqual(["Ryan O'Reilly"]);
    expect(names(searchPlayers("O’Reilly", pool))).toEqual(["Ryan O'Reilly"]);
    expect(names(searchPlayers("nugent hopkins", pool))).toEqual(["Ryan Nugent-Hopkins"]);
    expect(names(searchPlayers("stutzle", pool))).toEqual(["Tim Stützle"]);
  });

  it("lists shared surnames as distinct players, alphabetically", () => {
    expect(names(searchPlayers("hughes", pool))).toEqual(["Cameron Hughes", "Jack Hughes", "Luke Hughes", "Quinn Hughes", "T.J. Hughes"]);
    expect(names(searchPlayers("tkachuk", pool))).toEqual(["Brady Tkachuk", "Matthew Tkachuk"]);
  });

  it("orders exact > full-name prefix > word prefix > contains, deterministically", () => {
    const q = "connor";
    const result = names(searchPlayers(q, pool));
    const firstWordPrefix = result.findIndex((n) => !n.toLowerCase().startsWith(q));
    expect(result.slice(0, firstWordPrefix).every((n) => n.toLowerCase().startsWith(q))).toBe(true);
    expect(result).toContain("Kyle Connor");
    expect(names(searchPlayers(q, pool))).toEqual(result);
  });

  it("returns nothing for empty input and caps results at 20 by default", () => {
    expect(searchPlayers("   ", pool)).toEqual([]);
    expect(searchPlayers("a", pool).length).toBe(20);
  });

  it("includes the user's custom players in the same results", () => {
    const custom: Player = { id: "player-1", name: "Joe Callup", nhlTeamId: "SEA", eligiblePositions: ["RW"], nhlPlayerId: null, source: "CUSTOM" };
    expect(names(searchPlayers("callup", [...pool, custom]))).toEqual(["Joe Callup"]);
  });
});

describe("already rostered and duplicates", () => {
  const mcdavid = CATALOG_PLAYERS[MCDAVID];

  it("detects a rostered catalog player by NHL id, even under another entity id", () => {
    const legacyCopy: Player = { ...mcdavid, id: "player-legacy" };
    expect(isRostered(mcdavid, [{ playerId: "player-legacy", rosterStatus: "ACTIVE" }], { "player-legacy": legacyCopy })).toBe(true);
    expect(isRostered(mcdavid, [], {})).toBe(false);
  });

  it("the reducer never creates a second roster entry for the same player", () => {
    let s = reducer(createInitialState(), { type: "player/upsert", player: mcdavid });
    s = reducer(s, { type: "roster/add", playerId: mcdavid.id });
    expect(reducer(s, { type: "roster/add", playerId: mcdavid.id })).toBe(s);
  });

  it("points manual creation at an existing catalog player instead of duplicating", () => {
    expect(findExistingIdentity("connor mcdavid", "EDM", pool)).toEqual({ kind: "catalog", player: mcdavid });
  });

  it("reuses an existing custom player with the same name and team", () => {
    const custom: Player = { id: "player-1", name: "Joe Callup", nhlTeamId: "SEA", eligiblePositions: ["RW"], nhlPlayerId: null, source: "CUSTOM" };
    expect(findExistingIdentity("Joe  Callup", "SEA", [...pool, custom])).toEqual({ kind: "custom", player: custom });
    expect(findExistingIdentity("Joe Callup", "VAN", [...pool, custom])).toBeNull();
  });
});

describe("planning with catalog players (engine unchanged)", () => {
  const base = { weekStart: "2026-09-28", scheduleProvider: provider, rosterConfiguration: DEFAULT_ROSTER_CONFIGURATION };
  const custom: Player = { id: "player-x", name: "Joe Callup", nhlTeamId: "BOS", eligiblePositions: ["C"], nhlPlayerId: null, source: "CUSTOM" };
  const players = withCatalog({ [custom.id]: custom });
  const tx = (t: Partial<PlannedTransaction>): PlannedTransaction => ({
    id: "t",
    type: "ADD",
    effectiveDate: "2026-10-01",
    status: "PLANNED",
    createdAt: "",
    ...t,
  });

  it("ADD: the catalog player joins on the effective date and plays their NHL team's games", () => {
    const week = generateWeek({ ...base, roster: [], players, plannedTransactions: [tx({ addPlayerId: MCDAVID })] });
    expect(week.days.map((d) => d.roster.some((r) => r.playerId === MCDAVID))).toEqual([false, false, false, true, true, true, true]);
    // EDM plays Tue, Thu, Sat; only Thu and Sat are on/after the effective date.
    expect(week.summary.startsByPlayer[MCDAVID]).toBe(2);
    expect(week.days[1].noGame).toEqual([]); // not on the roster before Thursday
  });

  it("ADD_DROP: swaps from the effective date and counts one acquisition", () => {
    const moves = [tx({ type: "ADD_DROP", addPlayerId: MCDAVID, dropPlayerId: custom.id })];
    const week = generateWeek({ ...base, roster: [{ playerId: custom.id, rosterStatus: "ACTIVE" }], players, plannedTransactions: moves });
    expect(week.days.map((d) => d.roster.map((r) => r.playerId).join())).toEqual([
      custom.id, custom.id, custom.id, MCDAVID, MCDAVID, MCDAVID, MCDAVID,
    ]);
    expect(acquisitionsUsed(moves, "2026-09-28")).toBe(1);
  });

  it("DROP stays at zero acquisitions and ADD at one", () => {
    expect(acquisitionsUsed([tx({ type: "DROP", dropPlayerId: custom.id })], "2026-09-28")).toBe(0);
    expect(acquisitionsUsed([tx({ addPlayerId: MCDAVID })], "2026-09-28")).toBe(1);
  });

  it("no-game and benched behavior are unchanged for catalog players", () => {
    const roster: RosterPlayer[] = [
      { playerId: MCDAVID, rosterStatus: "ACTIVE" },
      { playerId: catalogPlayerId(8477934), rosterStatus: "ACTIVE" }, // Leon Draisaitl, EDM, C
    ];
    const cfg = { ...DEFAULT_ROSTER_CONFIGURATION, slots: { C: 1, LW: 0, RW: 0, D: 0, UTIL: 0, G: 0 } };
    const monday = generateDailyLineup({ roster, players, date: "2026-09-28", scheduleProvider: provider, rosterConfiguration: cfg });
    expect(monday.noGame).toHaveLength(2); // EDM idle Monday
    const tuesday = generateDailyLineup({ roster, players, date: "2026-09-29", scheduleProvider: provider, rosterConfiguration: cfg });
    expect(tuesday.activeSlots.filter((a) => a.playerId)).toHaveLength(1);
    expect(tuesday.benchedGames).toHaveLength(1);
  });
});

describe("persistence", () => {
  it("stores only user-owned players, never the bundled catalog", () => {
    const { data, repo } = memoryRepo();
    let s = reducer(createInitialState(), { type: "player/upsert", player: CATALOG_PLAYERS[MCDAVID] });
    s = reducer(s, { type: "roster/add", playerId: MCDAVID });
    repo.save(s);
    const stored = JSON.parse(data.get(STORAGE_KEY)!);
    expect(Object.keys(stored.players)).toEqual([MCDAVID]);
    expect(repo.load().state.players[MCDAVID]).toEqual(CATALOG_PLAYERS[MCDAVID]);
  });

  it("keeps manual players, without an NHL id, searchable after a reload", () => {
    const { repo } = memoryRepo();
    const custom = playerFromDraft({ name: "Joe Callup", nhlTeamId: "SEA", eligiblePositions: ["RW"], headshot: "" }, "player-9");
    expect(custom).toMatchObject({ source: "CUSTOM", nhlPlayerId: null });
    repo.save(reducer(createInitialState(), { type: "player/upsert", player: custom }));
    const reloaded = repo.load().state;
    expect(names(searchPlayers("callup", Object.values(withCatalog(reloaded.players))))).toEqual(["Joe Callup"]);
  });

  it("loads older records (no identity fields, legacy custom flag or nhlId) without losing data", () => {
    const { data, repo } = memoryRepo();
    data.set(
      STORAGE_KEY,
      JSON.stringify({
        ...createInitialState(),
        players: {
          a: { id: "a", name: "Old Custom", nhlTeamId: "BOS", eligiblePositions: ["C"], custom: true },
          b: { id: "b", name: "Plain Record", nhlTeamId: "NYR", eligiblePositions: ["D"] },
          "nhl-8478402": { id: "nhl-8478402", name: "Connor McDavid", nhlTeamId: "EDM", eligiblePositions: ["C"], nhlId: 8478402 },
        },
        roster: [{ playerId: "a", rosterStatus: "ACTIVE" }, { playerId: "nhl-8478402", rosterStatus: "BENCH" }],
      }),
    );
    const res = repo.load();
    expect(res.status).toBe("loaded");
    expect(res.state.players.a).toMatchObject({ source: "CUSTOM", nhlPlayerId: null });
    expect(res.state.players.b).toMatchObject({ source: "CUSTOM", nhlPlayerId: null });
    expect(res.state.players["nhl-8478402"]).toMatchObject({ source: "NHL", nhlPlayerId: 8478402 });
    expect(res.state.roster).toHaveLength(2);
  });
});
