import { describe, expect, it } from "vitest";
import { player } from "@/domain/testing/fixtures";
import { createInitialState, type AppState } from "./appState";
import { LocalStorageRepository, STORAGE_KEY } from "./repository";
import { cloudActiveKey, LocalWorkspaces, localWorkspaceKey, PRIMARY_LOCAL_ID, resolveActiveWorkspace, WORKSPACE_INDEX_KEY } from "./workspaces";

function memory() {
  const data = new Map<string, string>();
  return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } };
}
function team(name: string, league: string, adds: number, playerId: string): AppState {
  const s = createInitialState();
  s.setupComplete = true;
  s.settings = { ...s.settings, teamName: name, leagueName: league, weeklyAcquisitionLimit: adds };
  s.players = { [playerId]: player(playerId, "TOR", "C") };
  s.roster = [{ playerId, rosterStatus: "ACTIVE" }];
  return s;
}

describe("local team workspaces", () => {
  it("an existing single-team user becomes the first workspace, untouched (no copy, no rewrite)", () => {
    const { data, storage } = memory();
    const existing = JSON.stringify(team("Ivar's Fish Bar", "The Benchwarmers", 6, "pa"));
    data.set(STORAGE_KEY, existing);
    const ws = new LocalWorkspaces(storage);
    expect(ws.activeId()).toBe(PRIMARY_LOCAL_ID);
    expect(ws.list()).toEqual([{ id: PRIMARY_LOCAL_ID, teamName: "Ivar's Fish Bar", leagueName: "The Benchwarmers", season: "2026-27" }]);
    expect(ws.repo(PRIMARY_LOCAL_ID).load().state.roster).toEqual([{ playerId: "pa", rosterStatus: "ACTIVE" }]);
    expect(data.get(STORAGE_KEY)).toBe(existing); // non-destructive
    // Idempotent: reading again changes nothing and creates no duplicates.
    expect(new LocalWorkspaces(storage).list()).toHaveLength(1);
  });

  it("a brand-new browser has no teams yet (setup)", () => {
    expect(new LocalWorkspaces(memory().storage).list()).toEqual([]);
  });

  it("adding another team never overwrites the first; switching restores each team exactly", () => {
    const { data, storage } = memory();
    const ws = new LocalWorkspaces(storage);
    ws.repo(PRIMARY_LOCAL_ID).save(team("Ivar's Fish Bar", "The Benchwarmers", 6, "pa"));
    const b = "local-b";
    ws.repo(b).save(team("Weekend At Beniers", "Farm to Fame", 4, "pb"));
    ws.add(b);
    ws.add(b); // idempotent
    expect(ws.index().extra).toEqual([b]);
    expect(ws.activeId()).toBe(b);
    expect(ws.list().map((w) => w.teamName)).toEqual(["Ivar's Fish Bar", "Weekend At Beniers"]);
    expect(ws.repo(b).load().state.settings.weeklyAcquisitionLimit).toBe(4);
    ws.setActive(PRIMARY_LOCAL_ID);
    const a = ws.repo(PRIMARY_LOCAL_ID).load().state;
    expect(a.settings.weeklyAcquisitionLimit).toBe(6);
    expect(a.roster.map((r) => r.playerId)).toEqual(["pa"]);
    expect(data.has(localWorkspaceKey(b))).toBe(true);
  });

  it("the active team persists across reloads; a missing or malformed active id falls back safely", () => {
    const { data, storage } = memory();
    const ws = new LocalWorkspaces(storage);
    ws.add("local-b");
    expect(new LocalWorkspaces(storage).activeId()).toBe("local-b");
    data.set(WORKSPACE_INDEX_KEY, JSON.stringify({ version: 1, activeId: "local-gone", extra: ["local-b"] }));
    expect(new LocalWorkspaces(storage).activeId()).toBe(PRIMARY_LOCAL_ID);
    data.set(WORKSPACE_INDEX_KEY, "{not json");
    expect(new LocalWorkspaces(storage).index()).toEqual({ version: 1, activeId: PRIMARY_LOCAL_ID, extra: [] });
    new LocalWorkspaces(storage).setActive("local-unknown");
    expect(new LocalWorkspaces(storage).activeId()).toBe(PRIMARY_LOCAL_ID);
  });

  it("extra slots never read the v1 legacy key (only the primary team can migrate from v1)", () => {
    const { data, storage } = memory();
    data.set("shift.streaming.v1", "{}");
    expect(new LocalStorageRepository(storage, localWorkspaceKey("local-b")).load().status).toBe("empty");
  });
});

describe("choosing the active cloud team", () => {
  const list = [
    { id: "a", teamName: "A", leagueName: "L1", season: "2026-27", updatedAt: "2026-09-28T10:00:00Z" },
    { id: "b", teamName: "B", leagueName: "L2", season: "2026-27", updatedAt: "2026-09-29T10:00:00Z" },
  ];
  it("restores the remembered team, else the most recently updated, else none", () => {
    expect(resolveActiveWorkspace(list, "a")).toBe("a");
    expect(resolveActiveWorkspace(list, "deleted")).toBe("b");
    expect(resolveActiveWorkspace(list, null)).toBe("b");
    expect(resolveActiveWorkspace([], "a")).toBeNull();
  });
  it("remembers the active team per account, so user B never inherits user A's choice", () => {
    expect(cloudActiveKey("user-a")).not.toBe(cloudActiveKey("user-b"));
  });
});
