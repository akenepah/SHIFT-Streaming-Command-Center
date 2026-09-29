import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "../appState";
import { LocalWorkspaces, type MigrationSource } from "../workspaces";
import { CloudRepository, type WorkspaceSummary } from "./repository";

/** Compare persisted workspace content, ignoring object order and presentation-only catalog metadata. */
export function workspaceContent(state: AppState): string {
  const players = Object.values(state.players).sort((a, b) => a.id.localeCompare(b.id)).map(p => ({
    id: p.id, name: p.name.trim(), nhlTeamId: p.nhlTeamId,
    eligiblePositions: [...p.eligiblePositions].sort(), headshot: p.headshot || null,
    nhlPlayerId: p.nhlPlayerId ?? null,
    primaryPosition: p.nhlPlayerId ? p.primaryPosition ?? null : null,
    yahooPlayerId: p.nhlPlayerId ? p.yahooPlayerId ?? null : null,
    eligibilitySource: p.nhlPlayerId ? p.eligibilitySource ?? null : "USER",
    eligibilitySeason: p.nhlPlayerId ? p.eligibilitySeason ?? null : null,
  }));
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
  };
  return JSON.stringify(canonical({
    settings: { ...state.settings, leagueName: state.settings.leagueName.trim(), teamName: state.settings.teamName.trim() },
    setupComplete: state.setupComplete, players, roster: state.roster, overrides: state.overrides,
    transactions: [...state.transactions].sort((a, b) => a.id.localeCompare(b.id)).map(t => ({ ...t, createdAt: Number.isNaN(Date.parse(t.createdAt)) ? t.createdAt : new Date(t.createdAt).toISOString() })),
    needsRepair: state.needsRepair,
  }));
}

/** RLS constrains this lookup to the authenticated owner. Never guess by list order or name. */
export async function findWorkspaceByOrigin(client: SupabaseClient, originKey: string): Promise<string | null> {
  const { data, error } = await client.from("leagues").select("id").eq("origin_key", originKey).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function assertOwner(client: SupabaseClient, userId: string, current: () => boolean) {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== userId || !current()) throw new Error("Your session changed. Sign in again.");
}

/** Existing durable origins win; legacy identical content is a fallback, never names alone. */
export async function discoverMigrations(client: SupabaseClient, userId: string, local: LocalWorkspaces, list: WorkspaceSummary[], current: () => boolean): Promise<MigrationSource[]> {
  const sources = local.migrationSources(userId);
  const pending: MigrationSource[] = [];
  const snapshots = new Map<string, AppState>();
  for (const source of sources) {
    await assertOwner(client, userId, current);
    let match = await findWorkspaceByOrigin(client, source.originKey);
    const durableMatch = !!match;
    if (!match) {
      for (const item of list) {
        let state = snapshots.get(item.id);
        if (!state) {
          state = await new CloudRepository(client, userId, item.id).load() ?? undefined;
          if (state) snapshots.set(item.id, state);
        }
        if (state && workspaceContent(state) === workspaceContent(source.state)) { match = item.id; break; }
      }
    }
    if (match) {
      const remote = new CloudRepository(client, userId, match);
      const saved = await remote.load();
      if (!saved) throw new Error("Couldn't verify the saved team. Your local data is unchanged.");
      if (durableMatch && remote.revision === 1 && workspaceContent(saved) !== workspaceContent(source.state))
        throw new Error("The saved team did not match the local setup. Your local data is retained; please retry or contact support.");
      await assertOwner(client, userId, current);
      local.completeMigration(source, userId, match);
    } else pending.push(source);
  }
  return pending;
}

export async function adoptLocalWorkspace(client: SupabaseClient, userId: string, local: LocalWorkspaces, source: MigrationSource, current: () => boolean) {
  await assertOwner(client, userId, current);
  local.claimMigration(source, userId);
  let id = await findWorkspaceByOrigin(client, source.originKey);
  if (!id) {
    const remote = new CloudRepository(client, userId, null, source.originKey);
    try {
      await remote.save(source.state);
      id = remote.leagueId;
    } catch (error) {
      // A response can be lost after the atomic DB commit, or a second tab can win the create.
      await assertOwner(client, userId, current);
      id = await findWorkspaceByOrigin(client, source.originKey);
      if (!id) throw error;
    }
  }
  if (!id) throw new Error("Couldn't verify the saved team. Your local data is unchanged.");
  const remote = new CloudRepository(client, userId, id);
  const saved = await remote.load();
  if (!saved || (remote.revision === 1 && workspaceContent(saved) !== workspaceContent(source.state)))
    throw new Error("The saved team did not match the local setup. Your local data is retained; please retry or contact support.");
  await assertOwner(client, userId, current);
  local.completeMigration(source, userId, id);
  return { remote, state: saved, localId: source.id };
}
