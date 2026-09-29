import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { player } from "@/domain/testing/fixtures";
import { createInitialState, type AppState } from "../appState";
import { migrationPayload } from "./repository";

/** Multi-team workspaces against the real SQL migrations (PGlite). */
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;
    grant usage on schema public,auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    insert into auth.users values('${A}'),('${B}');`);
  for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

async function as(id: string) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`); }
function team(name: string, league: string, adds: number, slots: Partial<Record<"C" | "LW" | "RW" | "D", number>>, playerId: string): AppState {
  const s = createInitialState();
  s.setupComplete = true;
  s.settings = { ...s.settings, teamName: name, leagueName: league, weeklyAcquisitionLimit: adds, roster: { ...s.settings.roster, slots: { ...s.settings.roster.slots, ...slots } } };
  s.players = { [playerId]: player(playerId, "TOR", "C") };
  s.roster = [{ playerId, rosterStatus: "ACTIVE" }];
  s.transactions = [{ id: `tx-${playerId}`, type: "DROP", dropPlayerId: playerId, effectiveDate: "2026-10-07", status: "PLANNED", createdAt: "2026-09-28T12:00:00Z" }];
  s.overrides = [{ date: "2026-10-06", playerId, targetSlotId: "C1" }];
  return s;
}
async function save(id: string | null, s: AppState, rev: number, origin: string | null = null) {
  const { rows } = await db.query<{ r: { leagueId: string; revision: number } }>("select public.save_shift_workspace($1::uuid,$2::jsonb,$3::bigint,$4) r", [id, JSON.stringify(migrationPayload(s)), rev, origin]);
  return rows[0].r;
}
async function load(id: string) {
  const { rows } = await db.query<{ r: { leagueId: string; revision: number; state: AppState } | null }>("select public.load_shift_workspace($1::uuid) r", [id]);
  return rows[0].r;
}
async function list() {
  const { rows } = await db.query<{ r: { id: string; teamName: string; leagueName: string }[] }>("select public.list_shift_workspaces() r");
  return rows[0].r;
}

describe("multi-team workspaces (SQL)", () => {
  let teamA = "", teamB = "";

  it("one user can own several teams in different leagues; the list is lightweight and ordered", async () => {
    await as(A);
    teamA = (await save(null, team("Ivar's Fish Bar", "The Benchwarmers", 6, { C: 3, LW: 3, RW: 3, D: 4 }, "pa"), 0, "initial")).leagueId;
    teamB = (await save(null, team("Weekend At Beniers", "Farm to Fame", 4, { C: 2, LW: 2, RW: 2, D: 5 }, "pb"), 0, "draft-b")).leagueId;
    expect(teamA).not.toBe(teamB);
    const l = await list();
    expect(l.map((w) => [w.teamName, w.leagueName])).toEqual([["Ivar's Fish Bar", "The Benchwarmers"], ["Weekend At Beniers", "Farm to Fame"]]);
    expect(Object.keys(l[0]).sort()).toEqual(["createdAt", "id", "leagueName", "season", "setupComplete", "teamName", "updatedAt"]);
  });

  it("settings, roster, moves and overrides are isolated per team", async () => {
    await as(A);
    const a = (await load(teamA))!.state, b = (await load(teamB))!.state;
    expect(a.settings).toMatchObject({ weeklyAcquisitionLimit: 6, roster: { slots: { C: 3, LW: 3, RW: 3, D: 4 } } });
    expect(b.settings).toMatchObject({ weeklyAcquisitionLimit: 4, roster: { slots: { C: 2, LW: 2, RW: 2, D: 5 } } });
    expect(a.roster.map((r) => r.playerId)).toEqual(["pa"]);
    expect(b.roster.map((r) => r.playerId)).toEqual(["pb"]);
    expect(a.transactions.map((t) => t.id)).toEqual(["tx-pa"]);
    expect(b.transactions.map((t) => t.id)).toEqual(["tx-pb"]);
    expect(a.overrides.map((o) => o.playerId)).toEqual(["pa"]);
    expect(Object.keys(b.players)).toEqual(["pb"]);
  });

  it("editing team B leaves team A exactly as it was", async () => {
    await as(A);
    const before = await load(teamA);
    const b = (await load(teamB))!;
    const edited = { ...b.state, settings: { ...b.state.settings, weeklyAcquisitionLimit: 3 } };
    await save(teamB, edited, b.revision);
    expect(await load(teamA)).toEqual(before);
    expect((await load(teamB))!.state.settings.weeklyAcquisitionLimit).toBe(3);
  });

  it("creation is idempotent per origin key (double submit / retry / second tab)", async () => {
    await as(A);
    await expect(save(null, team("Dup", "Dup", 6, {}, "px"), 0, "draft-b")).rejects.toThrow("SHIFT_DUPLICATE");
    expect(await list()).toHaveLength(2);
  });

  it("stale saves conflict instead of overwriting", async () => {
    await as(A);
    await expect(save(teamA, team("Stale", "Stale", 6, {}, "pa"), 0)).rejects.toThrow("SHIFT_CONFLICT");
  });

  it("single-team (old) clients stay pinned to the first team", async () => {
    await as(A);
    const { rows } = await db.query<{ r: { leagueId: string; state: AppState } }>("select public.load_shift_state() r");
    expect(rows[0].r.leagueId).toBe(teamA);
    expect(rows[0].r.state.settings.teamName).toBe("Ivar's Fish Bar");
  });

  it("another user sees none of A's teams and can't load or write them by id", async () => {
    await as(B);
    expect(await list()).toEqual([]);
    expect(await load(teamA)).toBeNull();
    await expect(save(teamA, team("Hijack", "Hijack", 6, {}, "h"), 1)).rejects.toThrow("SHIFT_NOT_FOUND");
    expect((await db.query("select * from public.leagues")).rows).toHaveLength(0);
    await as(A);
    expect((await load(teamA))!.state.settings.teamName).toBe("Ivar's Fish Bar");
  });
});
