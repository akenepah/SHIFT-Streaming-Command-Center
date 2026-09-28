import { describe, expect, it } from "vitest";
import { DEFAULT_LEAGUE_SETTINGS } from "@/domain/config";
import { findRosterDuplicate, normalizeName } from "@/domain/roster/duplicates";
import { validatePlayerDraft } from "@/domain/roster/playerDraft";
import type { Player } from "@/domain/types";
import { APP_STATE_VERSION, createInitialState, type AppState } from "./appState";
import { LEGACY_DEMO_PLAYERS, isUntouchedDemoPlayer, legacyDemoV1Payload } from "./legacyDemo";
import { reducer } from "./reducer";
import { LEGACY_BACKUP_KEY, LEGACY_STORAGE_KEY, LocalStorageRepository, STORAGE_KEY } from "./repository";
import { rosterSummary } from "./selectors";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const skater = (id: string, name: string, team: Player["nhlTeamId"] = "BOS"): Player => ({
  id,
  name,
  nhlTeamId: team,
  eligiblePositions: ["C", "RW"],
  nhlPlayerId: null,
  source: "CUSTOM",
});

/** A user who created two players and rostered them. */
function userState(): AppState {
  let s = createInitialState();
  s = reducer(s, { type: "player/upsert", player: skater("p1", "Brady Tkachuk", "OTT") });
  s = reducer(s, { type: "player/upsert", player: skater("p2", "Tim Stützle", "OTT") });
  s = reducer(s, { type: "roster/add", playerId: "p1", status: "ACTIVE" });
  s = reducer(s, { type: "roster/add", playerId: "p2" });
  return s;
}

describe("fresh state", () => {
  it("has league defaults and no roster, players, moves or overrides", () => {
    const s = createInitialState();
    expect(s.version).toBe(APP_STATE_VERSION);
    expect(s.settings).toEqual(DEFAULT_LEAGUE_SETTINGS);
    expect(s.players).toEqual({});
    expect(s.roster).toEqual([]);
    expect(s.transactions).toEqual([]);
    expect(s.overrides).toEqual([]);
    expect(s.needsRepair).toEqual([]);
    expect(s.setupComplete).toBe(false);
  });

  it("loads with no demo roster when storage is empty", () => {
    const res = new LocalStorageRepository(new MemoryStorage()).load();
    expect(res.status).toBe("empty");
    expect(res.state).toEqual(createInitialState());
  });
});

describe("setup", () => {
  it("can be completed with a partial roster", () => {
    let s = createInitialState();
    s = reducer(s, { type: "player/upsert", player: skater("p1", "One Player") });
    s = reducer(s, { type: "roster/add", playerId: "p1" });
    s = reducer(s, { type: "setup/complete" });
    expect(s.setupComplete).toBe(true);
    expect(s.roster).toHaveLength(1);
  });

  it("can be completed with an empty roster", () => {
    expect(reducer(createInitialState(), { type: "setup/complete" }).setupComplete).toBe(true);
  });
});

describe("persistence (v2)", () => {
  it("round-trips a manually created player, roster, settings, moves and overrides", () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepository(storage);
    let s = userState();
    s = reducer(s, { type: "settings/update", settings: { ...s.settings, teamName: "Real Team" } });
    s = reducer(s, {
      type: "tx/create",
      id: "t1",
      draft: { type: "DROP", dropPlayerId: "p2", effectiveDate: "2026-10-15" },
      now: "2026-10-01T00:00:00Z",
    });
    s = reducer(s, { type: "override/set", override: { date: "2026-10-13", playerId: "p1", targetSlotId: "RW1" } });
    repo.save(s);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(repo.load()).toEqual({ status: "loaded", state: s });
  });

  it("falls back to a clean state on corrupt JSON and keeps a backup", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const res = new LocalStorageRepository(storage).load();
    expect(res.status).toBe("corrupt");
    expect(res.state).toEqual(createInitialState());
    expect(storage.getItem(`${STORAGE_KEY}.corrupt`)).toBe("{not json");
  });

  it("works without storage (private mode / blocked)", () => {
    const repo = new LocalStorageRepository(null);
    expect(repo.load().status).toBe("empty");
    expect(() => repo.save(createInitialState())).not.toThrow();
  });
});

describe("player validation", () => {
  const draft = { name: "Real Player", nhlTeamId: "BOS" as const, eligiblePositions: ["C" as const], headshot: "" };

  it("rejects an invalid NHL team", () => {
    expect(validatePlayerDraft({ ...draft, nhlTeamId: "XXX" as never })).toContain("Choose an NHL team.");
  });

  it("rejects an empty position list", () => {
    expect(validatePlayerDraft({ ...draft, eligiblePositions: [] })).toContain("Choose at least one position.");
  });

  it("rejects duplicate or unknown position values", () => {
    expect(validatePlayerDraft({ ...draft, eligiblePositions: ["C", "C"] })).toContain("Each position can only be listed once.");
    expect(validatePlayerDraft({ ...draft, eligiblePositions: ["X" as never] })).toContain("Positions must be C, LW, RW, D or G.");
  });

  it("moves malformed stored players to needsRepair instead of crashing or dropping them", () => {
    const storage = new MemoryStorage();
    const s = userState();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...s,
        players: {
          ...s.players,
          bad: { id: "bad", name: "Broken Guy", nhlTeamId: "XXX", eligiblePositions: ["C", "C"] },
          nopos: { id: "nopos", name: "No Positions", nhlTeamId: "BOS", eligiblePositions: [] },
        },
        roster: [...s.roster, { playerId: "bad", rosterStatus: "BENCH" }, { playerId: "nopos", rosterStatus: "ACTIVE" }],
      }),
    );
    const res = new LocalStorageRepository(storage).load();
    expect(res.status).toBe("loaded");
    expect(res.state.roster).toEqual(s.roster);
    expect(res.state.players.bad).toBeUndefined();
    expect(res.state.needsRepair).toEqual([
      {
        playerId: "bad",
        name: "Broken Guy",
        nhlTeamId: "XXX",
        eligiblePositions: ["C", "C"],
        rosterStatus: "BENCH",
        problems: ['Unknown NHL team "XXX"'],
      },
      {
        playerId: "nopos",
        name: "No Positions",
        nhlTeamId: "BOS",
        eligiblePositions: [],
        rosterStatus: "ACTIVE",
        problems: ["No valid positions"],
      },
    ]);
  });

  it("lets the user repair a player back onto the roster, or remove it", () => {
    const s: AppState = {
      ...userState(),
      needsRepair: [
        { playerId: "bad", name: "Broken Guy", nhlTeamId: "XXX", eligiblePositions: ["C"], rosterStatus: "BENCH", problems: ["x"] },
      ],
      transactions: [
        { id: "t", type: "DROP", dropPlayerId: "bad", effectiveDate: "2026-10-15", status: "PLANNED", createdAt: "" },
      ],
    };
    const fixed = reducer(s, { type: "repair/resolve", player: skater("bad", "Broken Guy", "NYR") });
    expect(fixed.needsRepair).toEqual([]);
    expect(fixed.players.bad.nhlTeamId).toBe("NYR");
    expect(fixed.roster.at(-1)).toEqual({ playerId: "bad", rosterStatus: "BENCH" });

    const removed = reducer(s, { type: "repair/remove", playerId: "bad" });
    expect(removed.needsRepair).toEqual([]);
    expect(removed.transactions).toEqual([]);
    expect(removed.roster).toEqual(s.roster);
  });
});

describe("duplicate protection", () => {
  const s = userState();

  it("normalizes case, accents, punctuation and spacing", () => {
    expect(normalizeName("  Tim   STÜTZLE ")).toBe("tim stutzle");
    expect(normalizeName("J.T. Miller")).toBe(normalizeName("JT Miller"));
  });

  it("finds a rostered player with the same normalized name", () => {
    expect(findRosterDuplicate("tim stutzle", s.roster, s.players)?.id).toBe("p2");
    expect(findRosterDuplicate("Someone Else", s.roster, s.players)).toBeUndefined();
  });

  it("ignores the player being edited and players who aren't rostered", () => {
    expect(findRosterDuplicate("Tim Stützle", s.roster, s.players, "p2")).toBeUndefined();
    const dropped = reducer(s, { type: "roster/drop", playerId: "p2" });
    expect(findRosterDuplicate("Tim Stützle", dropped.roster, dropped.players)).toBeUndefined();
  });
});

describe("legacy demo migration (v1 → v2)", () => {
  const demoRecord = (id: string): Player => {
    const { rosterStatus: _r, ...record } = LEGACY_DEMO_PLAYERS.find((p) => p.id === id)!;
    void _r;
    return record;
  };

  it("recognizes untouched sample players only", () => {
    const mcdavid = demoRecord("seed-mcdavid");
    expect(isUntouchedDemoPlayer(mcdavid)).toBe(true);
    expect(isUntouchedDemoPlayer({ ...mcdavid, nhlTeamId: "NYR" })).toBe(false);
    expect(isUntouchedDemoPlayer({ ...mcdavid, custom: true })).toBe(false); // raw v1 flag for user-created players
    expect(isUntouchedDemoPlayer({ ...mcdavid, id: "player-123" })).toBe(false);
  });

  it("removes a pure demo state completely and never brings it back", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyDemoV1Payload()));
    const repo = new LocalStorageRepository(storage);

    const first = repo.load();
    expect(first.status).toBe("migrated");
    if (first.status !== "migrated") return;
    expect(first.removedDemoPlayers).toBe(LEGACY_DEMO_PLAYERS.length);
    expect(first.state.players).toEqual({});
    expect(first.state.roster).toEqual([]);
    expect(first.state.setupComplete).toBe(false);
    expect(storage.data.has(LEGACY_STORAGE_KEY)).toBe(false);
    expect(storage.data.has(LEGACY_BACKUP_KEY)).toBe(true);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);

    // Later loads read v2; the sample roster doesn't come back, even after a reset.
    expect(repo.load().status).toBe("loaded");
    repo.clear();
    expect(repo.load()).toEqual({ status: "empty", state: createInitialState() });
  });

  it("keeps genuine user data: created players, edited sample players, settings and their moves", () => {
    const v1 = legacyDemoV1Payload();
    const payload = {
      ...v1,
      settings: { ...v1.settings, teamName: "Ivar's Fish Bar" },
      players: {
        ...v1.players,
        "player-abc": { id: "player-abc", name: "My Guy", nhlTeamId: "SEA", eligiblePositions: ["LW"], custom: true },
        "seed-mctavish": { ...v1.players["seed-mctavish"], nhlTeamId: "NYR" }, // edited by the user
      },
      roster: [...v1.roster, { playerId: "player-abc", rosterStatus: "BENCH" }],
      transactions: [
        {
          id: "keep",
          type: "ADD_DROP",
          addPlayerId: "player-abc",
          dropPlayerId: "seed-mctavish",
          effectiveDate: "2026-10-15",
          status: "PLANNED",
          createdAt: "",
        },
        {
          id: "gone",
          type: "ADD_DROP",
          addPlayerId: "seed-aho",
          dropPlayerId: "player-abc",
          effectiveDate: "2026-10-15",
          status: "PLANNED",
          createdAt: "",
        },
      ],
      overrides: [
        { date: "2026-10-13", playerId: "player-abc", targetSlotId: "LW1" },
        { date: "2026-10-13", playerId: "seed-malkin", targetSlotId: "LW1" },
      ],
      setupComplete: true,
    };
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(payload));
    const res = new LocalStorageRepository(storage).load();
    expect(res.status).toBe("migrated");
    const s = res.state;
    expect(Object.keys(s.players).sort()).toEqual(["player-abc", "seed-mctavish"]);
    expect(s.roster.map((r) => r.playerId)).toEqual(["seed-mctavish", "player-abc"]);
    expect(s.transactions.map((t) => t.id)).toEqual(["keep"]);
    expect(s.overrides).toEqual([{ date: "2026-10-13", playerId: "player-abc", targetSlotId: "LW1" }]);
    expect(s.settings.teamName).toBe("Ivar's Fish Bar");
    expect(s.setupComplete).toBe(true);
  });

  it("never treats current (v2) user data as demo, even with legacy-looking ids", () => {
    const storage = new MemoryStorage();
    // A current (v2) record always carries its identity fields.
    const record: Player = { ...demoRecord("seed-mcdavid"), nhlPlayerId: null, source: "CUSTOM" };
    let s = reducer(createInitialState(), { type: "player/upsert", player: record });
    s = reducer(s, { type: "roster/add", playerId: record.id });
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyDemoV1Payload())); // a stale leftover is ignored
    expect(new LocalStorageRepository(storage).load()).toEqual({ status: "loaded", state: s });
  });
});

describe("reset local data", () => {
  it("returns to a clean first-run state", () => {
    let s = userState();
    s = reducer(s, { type: "setup/complete" });
    s = reducer(s, { type: "data/reset" });
    expect(s).toEqual(createInitialState());
  });
});

describe("reducer", () => {
  const base = userState();

  it("re-statuses and drops roster players, keeping them in the registry", () => {
    let s = reducer(base, { type: "roster/setStatus", playerId: "p2", status: "IR_PLUS" });
    expect(s.roster.find((r) => r.playerId === "p2")?.rosterStatus).toBe("IR_PLUS");
    s = reducer(s, { type: "roster/drop", playerId: "p2" });
    expect(s.roster.some((r) => r.playerId === "p2")).toBe(false);
    expect(s.players.p2).toBeDefined();
  });

  it("won't add a player twice or an unknown player", () => {
    expect(reducer(base, { type: "roster/add", playerId: "p1" })).toBe(base);
    expect(reducer(base, { type: "roster/add", playerId: "nobody" })).toBe(base);
  });

  it("changes a player's NHL team in the registry", () => {
    const s = reducer(base, { type: "player/upsert", player: { ...base.players.p1, nhlTeamId: "NYR" } });
    expect(s.players.p1.nhlTeamId).toBe("NYR");
  });

  it("creates, edits and cancels planned moves", () => {
    let s = reducer(base, {
      type: "tx/create",
      id: "t1",
      draft: { type: "ADD_DROP", addPlayerId: "x", dropPlayerId: "p2", effectiveDate: "2026-10-15" },
      now: "2026-10-10T00:00:00Z",
    });
    s = reducer(s, { type: "tx/update", id: "t1", draft: { type: "ADD", addPlayerId: "x", effectiveDate: "2026-10-16" } });
    expect(s.transactions[0]).toMatchObject({ type: "ADD", effectiveDate: "2026-10-16", dropPlayerId: undefined });
    s = reducer(s, { type: "tx/cancel", id: "t1" });
    expect(s.transactions[0].status).toBe("CANCELLED");
  });

  it("sets and resets day overrides", () => {
    let s = reducer(base, { type: "override/set", override: { date: "2026-10-13", playerId: "p1", targetSlotId: "RW1" } });
    s = reducer(s, { type: "override/set", override: { date: "2026-10-14", playerId: "p1", targetSlotId: "C1" } });
    s = reducer(s, { type: "override/resetDay", date: "2026-10-13" });
    expect(s.overrides).toEqual([{ date: "2026-10-14", playerId: "p1", targetSlotId: "C1" }]);
  });

  it("clears the roster along with its planned moves and overrides", () => {
    let s = reducer(base, { type: "override/set", override: { date: "2026-10-13", playerId: "p1", targetSlotId: "RW1" } });
    s = reducer(s, { type: "roster/clear" });
    expect(s.roster).toEqual([]);
    expect(s.overrides).toEqual([]);
    expect(Object.keys(s.players)).toHaveLength(2);
  });
});

describe("roster summary", () => {
  it("counts roster inventory, not daily starters", () => {
    let s = userState();
    s = reducer(s, { type: "player/upsert", player: skater("p3", "Hurt Guy") });
    s = reducer(s, { type: "roster/add", playerId: "p3", status: "IR_PLUS" });
    expect(rosterSummary(s.roster, s.settings)).toEqual({
      rostered: 3,
      regular: 2,
      regularCapacity: 20, // 15 active slots + 5 bench
      irPlus: 1,
      irPlusCapacity: 4,
    });
  });

  it("reports an all-bench roster as rostered players, not as zero active", () => {
    let s = createInitialState();
    for (let i = 0; i < 24; i++) {
      s = reducer(s, { type: "player/upsert", player: skater(`b${i}`, `Bench ${i}`) });
      s = reducer(s, { type: "roster/add", playerId: `b${i}`, status: "BENCH" });
    }
    expect(rosterSummary(s.roster, s.settings)).toMatchObject({ rostered: 24, irPlus: 0 });
  });
});
