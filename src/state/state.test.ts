import { describe, expect, it } from "vitest";
import { DEFAULT_LEAGUE_SETTINGS } from "@/domain/config";
import { isNHLTeamId } from "@/domain/nhl/teamIds";
import { LocalStorageRepository, STORAGE_KEY } from "./repository";
import { reducer } from "./reducer";
import { createEmptyState, createSeedState } from "./seed";

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

describe("seed data", () => {
  it("has valid teams and positions, and a roster that references known players", () => {
    const s = createSeedState();
    for (const p of Object.values(s.players)) {
      expect(isNHLTeamId(p.nhlTeamId), p.name).toBe(true);
      expect(p.eligiblePositions.length).toBeGreaterThan(0);
    }
    expect(s.roster.length).toBeGreaterThan(10);
    expect(s.roster.every((r) => s.players[r.playerId])).toBe(true);
    expect(s.settings).toEqual(DEFAULT_LEAGUE_SETTINGS);
  });
});

describe("LocalStorageRepository", () => {
  it("returns seed state when nothing is stored", () => {
    const repo = new LocalStorageRepository(new MemoryStorage());
    const res = repo.load();
    expect(res.status).toBe("empty");
    expect(res.state.roster.length).toBeGreaterThan(0);
  });

  it("round-trips state under the versioned key", () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepository(storage);
    const state = reducer(createSeedState(), { type: "setup/complete" });
    repo.save(state);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(repo.load()).toEqual({ status: "loaded", state });
  });

  it("falls back to seed data on corrupt JSON and keeps a backup", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const res = new LocalStorageRepository(storage).load();
    expect(res.status).toBe("corrupt");
    expect(storage.getItem(`${STORAGE_KEY}.corrupt`)).toBe("{not json");
  });

  it("treats an unknown version as corrupt", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(new LocalStorageRepository(storage).load().status).toBe("corrupt");
  });

  it("drops invalid records but keeps the rest", () => {
    const storage = new MemoryStorage();
    const good = createSeedState();
    const tampered = {
      ...good,
      players: { ...good.players, bad: { id: "bad", name: "Bad", nhlTeamId: "XXX", eligiblePositions: ["C"] } },
      roster: [...good.roster, { playerId: "bad", rosterStatus: "ACTIVE" }, { playerId: "missing", rosterStatus: "ACTIVE" }],
      transactions: [{ id: "t", type: "BOGUS" }],
      settings: { ...good.settings, weeklyAcquisitionLimit: "six" },
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(tampered));
    const res = new LocalStorageRepository(storage).load();
    expect(res.status).toBe("loaded");
    expect(res.state.players.bad).toBeUndefined();
    expect(res.state.roster).toEqual(good.roster);
    expect(res.state.transactions).toEqual([]);
    expect(res.state.settings.weeklyAcquisitionLimit).toBe(6);
  });

  it("works without storage (private mode / blocked)", () => {
    const repo = new LocalStorageRepository(null);
    expect(repo.load().status).toBe("empty");
    expect(() => repo.save(createSeedState())).not.toThrow();
  });

  it("clear removes stored state", () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepository(storage);
    repo.save(createSeedState());
    repo.clear();
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });
});

describe("reducer", () => {
  const base = createSeedState();

  it("adds, re-statuses and drops roster players", () => {
    const player = { id: "custom-1", name: "New Guy", nhlTeamId: "SEA" as const, eligiblePositions: ["LW" as const], custom: true };
    let s = reducer(base, { type: "player/upsert", player });
    s = reducer(s, { type: "roster/add", playerId: "custom-1" });
    expect(s.roster.at(-1)).toEqual({ playerId: "custom-1", rosterStatus: "BENCH" });
    s = reducer(s, { type: "roster/setStatus", playerId: "custom-1", status: "IR_PLUS" });
    expect(s.roster.at(-1)?.rosterStatus).toBe("IR_PLUS");
    s = reducer(s, { type: "roster/drop", playerId: "custom-1" });
    expect(s.roster.some((r) => r.playerId === "custom-1")).toBe(false);
    expect(s.players["custom-1"]).toEqual(player); // stays in the registry
  });

  it("won't add a player twice or an unknown player", () => {
    const id = base.roster[0].playerId;
    expect(reducer(base, { type: "roster/add", playerId: id })).toBe(base);
    expect(reducer(base, { type: "roster/add", playerId: "nobody" })).toBe(base);
  });

  it("changes a player's NHL team in the registry", () => {
    const p = base.players["seed-mctavish"];
    const s = reducer(base, { type: "player/upsert", player: { ...p, nhlTeamId: "NYR" } });
    expect(s.players["seed-mctavish"].nhlTeamId).toBe("NYR");
  });

  it("creates, edits and cancels planned moves", () => {
    let s = reducer(base, {
      type: "tx/create",
      id: "t1",
      draft: { type: "ADD_DROP", addPlayerId: "seed-aho", dropPlayerId: "seed-mctavish", effectiveDate: "2026-10-15" },
      now: "2026-10-10T00:00:00Z",
    });
    expect(s.transactions).toHaveLength(1);
    s = reducer(s, { type: "tx/update", id: "t1", draft: { type: "ADD", addPlayerId: "seed-aho", effectiveDate: "2026-10-16" } });
    expect(s.transactions[0]).toMatchObject({ type: "ADD", effectiveDate: "2026-10-16", dropPlayerId: undefined });
    s = reducer(s, { type: "tx/cancel", id: "t1" });
    expect(s.transactions[0].status).toBe("CANCELLED");
  });

  it("sets and resets day overrides", () => {
    let s = reducer(base, { type: "override/set", override: { date: "2026-10-13", playerId: "seed-malkin", targetSlotId: "LW1" } });
    s = reducer(s, { type: "override/set", override: { date: "2026-10-14", playerId: "seed-malkin", targetSlotId: "C1" } });
    s = reducer(s, { type: "override/resetDay", date: "2026-10-13" });
    expect(s.overrides).toEqual([{ date: "2026-10-14", playerId: "seed-malkin", targetSlotId: "C1" }]);
  });

  it("resets to sample or empty data", () => {
    const edited = reducer(base, { type: "setup/complete" });
    expect(reducer(edited, { type: "data/reset", mode: "sample" })).toEqual(createSeedState());
    expect(reducer(edited, { type: "data/reset", mode: "empty" })).toEqual(createEmptyState());
  });
});
