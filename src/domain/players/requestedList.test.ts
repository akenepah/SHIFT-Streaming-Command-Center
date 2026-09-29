import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import catalog from "@/data/players/2026-27.json";
import listEligibility from "@/data/players/eligibility-2026-27.json";
import reconciliation from "../../../docs/player-catalog/requested-reconciliation.json";
import { CATALOG_PLAYERS, catalogEligibility, catalogPlayerId, getCatalogEntry } from "./playerCatalog";
import { searchPlayers } from "./searchPlayers";

/** The user-supplied requested list is the catalog FLOOR: every name must reconcile. */
const requested = readFileSync("docs/player-catalog/requested-2026-27.csv", "utf8").trim().split(/\r?\n/).slice(1);
const results = reconciliation.results;

describe("requested 2026-27 player list (catalog floor)", () => {
  it("accounts for all 670 requested players with a unique NHL ID", () => {
    expect(requested).toHaveLength(670);
    expect(results).toHaveLength(670);
    expect(results.every((r) => r.nhlPlayerId !== null)).toBe(true);
    expect(new Set(results.map((r) => r.nhlPlayerId)).size).toBe(670);
    expect(reconciliation.summary).toMatchObject({ requested: 670, resolved: 670, unresolved: 0, duplicateNhlIds: [] });
  });

  it("keeps every requested player in the bundled catalog, with unique catalog IDs", () => {
    for (const r of results) expect(getCatalogEntry(r.nhlPlayerId!), r.requestedName).toBeDefined();
    const ids = catalog.players.map((p) => p.nhlPlayerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("honors explicit disambiguators instead of name strings", () => {
    const byName = new Map(results.map((r) => [r.requestedName, r]));
    expect(byName.get("Elias Pettersson")).toMatchObject({ nhlPlayerId: 8480012, primaryPosition: "C" });
    expect(byName.get("Elias Pettersson (D)")).toMatchObject({ nhlPlayerId: 8483678, primaryPosition: "D" });
    expect(byName.get("Daniil Tarasov (G)")).toMatchObject({ primaryPosition: "G" });
  });

  it("includes Kevin Fiala with his team", () => {
    expect(getCatalogEntry(8477942)).toMatchObject({ fullName: "Kevin Fiala", teamAbbrev: "LAK" });
  });

  it("carries multi-position fantasy eligibility from the list (never inferred from NHL position)", () => {
    const multi = listEligibility.players.filter((p) => p.eligiblePositions.length > 1);
    expect(multi.length).toBeGreaterThan(150);
    expect(multi.some((p) => p.eligiblePositions.length === 3)).toBe(true);
    // Seth Jarvis: NHL RW, list LW/RW.
    expect(CATALOG_PLAYERS[catalogPlayerId(8482093)]).toMatchObject({ eligiblePositions: ["LW", "RW"], eligibilitySource: "MANUAL" });
    expect(catalogEligibility({ nhlPlayerId: 1, primaryPosition: "C" })).toEqual({ eligiblePositions: ["C"], eligibilitySource: "NHL_PRIMARY_FALLBACK", yahooPlayerId: null });
    for (const p of listEligibility.players) {
      if (p.eligiblePositions.includes("G")) expect(p.eligiblePositions).toEqual(["G"]);
    }
  });

  it("finds every requested player that has a current NHL team through catalog search", () => {
    const pool = Object.values(CATALOG_PLAYERS);
    const missed = results
      .filter((r) => r.teamAbbrev)
      .filter((r) => !searchPlayers(r.resolvedName!, pool, 50).some((p) => p.nhlPlayerId === r.nhlPlayerId))
      .map((r) => r.requestedName);
    expect(missed).toEqual([]);
  });

  it("reports (does not invent) players without a current NHL team", () => {
    expect(reconciliation.summary.missingTeam).toEqual(results.filter((r) => !r.teamAbbrev).map((r) => r.requestedName));
    for (const name of reconciliation.summary.missingTeam) {
      const r = results.find((x) => x.requestedName === name)!;
      expect(CATALOG_PLAYERS[catalogPlayerId(r.nhlPlayerId!)]).toBeUndefined();
    }
  });
});

import { refreshCatalogEligibility } from "./playerCatalog";
import { playerFromDraft } from "../roster/playerDraft";

describe("saved catalog players pick up current eligibility (unless the user edited it)", () => {
  const jarvis = CATALOG_PLAYERS[catalogPlayerId(8482093)]; // list: LW/RW; NHL primary RW
  const legacy = { ...jarvis, eligiblePositions: ["RW" as const], eligibilitySource: undefined };

  it("upgrades a legacy record still at the old single-position default", () => {
    expect(refreshCatalogEligibility(legacy)).toMatchObject({ eligiblePositions: ["LW", "RW"], eligibilitySource: "MANUAL" });
  });

  it("never overwrites a user edit (explicit USER, or a non-default legacy value)", () => {
    const edited = { ...jarvis, eligiblePositions: ["C" as const, "RW" as const], eligibilitySource: "USER" as const };
    expect(refreshCatalogEligibility(edited)).toBe(edited);
    const legacyEdited = { ...legacy, eligiblePositions: ["C" as const, "RW" as const] };
    expect(refreshCatalogEligibility(legacyEdited)).toBe(legacyEdited);
  });

  it("leaves custom players alone", () => {
    const custom = { id: "x", name: "X", nhlTeamId: "EDM" as const, eligiblePositions: ["C" as const], source: "CUSTOM" as const };
    expect(refreshCatalogEligibility(custom)).toBe(custom);
  });

  it("saving a status/team-only edit keeps the catalog eligibility source", () => {
    const draft = { name: jarvis.name, nhlTeamId: jarvis.nhlTeamId, eligiblePositions: [...jarvis.eligiblePositions], headshot: jarvis.headshot ?? "" };
    expect(playerFromDraft(draft, jarvis.id, jarvis).eligibilitySource).toBe("MANUAL");
    expect(playerFromDraft({ ...draft, eligiblePositions: ["RW"] }, jarvis.id, jarvis).eligibilitySource).toBe("USER");
  });
});

describe("search word order", () => {
  it("finds surname-first queries", () => {
    const pool = Object.values(CATALOG_PLAYERS);
    expect(searchPlayers("hughes jack", pool).map((p) => p.name)).toContain("Jack Hughes");
    expect(searchPlayers("pettersson elias", pool).map((p) => p.nhlPlayerId).sort()).toEqual([8480012, 8483678]);
  });
});
