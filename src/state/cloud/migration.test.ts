import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInitialState, type AppState } from '../appState';
import { player } from '@/domain/testing/fixtures';
import { LocalWorkspaces, PRIMARY_LOCAL_ID, migrationMarkerKey } from '../workspaces';
import { CloudRepository, listCloudWorkspaces } from './repository';
import { adoptLocalWorkspace, discoverMigrations, findWorkspaceByOrigin, workspaceContent } from './migration';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated;
    grant usage on schema public,auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    insert into auth.users values('${A}'),('${B}');`);
  for (const f of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
}, 30000);
beforeEach(async () => { await db.exec('reset role; truncate public.leagues cascade;'); });
afterAll(async () => { await db?.close(); });

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
}
function sample(id = 'custom'): AppState {
  const s = createInitialState();
  s.setupComplete = true;
  s.settings = { ...s.settings, leagueName: 'Existing League', teamName: 'Existing Team', weeklyAcquisitionLimit: 5, numberOfTeams: 10, weekStartsOn: 2, defaultMoveTiming: 'TODAY' };
  s.players = { [id]: { ...player(id, 'TOR', 'C', 'RW'), source: 'CUSTOM', nhlPlayerId: null, eligibilitySource: 'USER' } };
  s.roster = [{ playerId: id, rosterStatus: 'BENCH' }];
  s.transactions = [{ id: 'drop', type: 'DROP', dropPlayerId: id, effectiveDate: '2026-10-07', status: 'PLANNED', createdAt: '2026-09-29T12:00:00Z' }];
  s.overrides = [{ date: '2026-10-06', playerId: id, targetSlotId: 'BN' }];
  return s;
}
// Real SQL/RLS with only the HTTP transport replaced; production repositories run unchanged.
function sdk(user: () => string = () => A, options: { failSave?: boolean; loseSaveReply?: boolean; corruptRead?: boolean; afterSave?: () => void } = {}): SupabaseClient {
  async function query(sql: string, args: unknown[] = []) {
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user()}';`);
    return db.query(sql, args);
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: user() } }, error: null }) },
    from: () => ({ select: () => ({ eq: (_key: string, value: string) => ({ maybeSingle: async () => {
      const { rows } = await query('select id from public.leagues where origin_key=$1', [value]);
      return { data: rows[0] ?? null, error: null };
    } }) }) }),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      try {
        if (name === 'save_shift_workspace' && options.failSave) throw new Error('offline');
        const call = name === 'save_shift_workspace'
          ? await query('select public.save_shift_workspace($1::uuid,$2::jsonb,$3::bigint,$4) data', [args.p_league_id, JSON.stringify(args.payload), args.expected_revision, args.p_origin_key])
          : name === 'load_shift_workspace'
            ? await query('select public.load_shift_workspace($1::uuid) data', [args.p_league_id])
            : await query('select public.list_shift_workspaces() data');
        const data = (call.rows[0] as { data: { state?: AppState } | null }).data;
        if (name === 'save_shift_workspace') {
          options.afterSave?.();
          if (options.loseSaveReply) throw new Error('reply lost');
        }
        if (name === 'load_shift_workspace' && options.corruptRead && data?.state) data.state.roster = [];
        return { data, error: null };
      } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    },
  } as unknown as SupabaseClient;
}
function localTeams() {
  const storage = memory();
  const local = new LocalWorkspaces(storage);
  local.repo(PRIMARY_LOCAL_ID).save(sample());
  return { storage, local };
}
const current = () => true;

describe('existing local team adoption', () => {
  it('offers all completed local teams to an authenticated account with no cloud teams', async () => {
    const { local } = localTeams();
    local.add('local-second'); local.repo('local-second').save(sample('other'));
    const sources = await discoverMigrations(sdk(), A, local, [], current);
    expect(sources.map(s => s.id)).toEqual([PRIMARY_LOCAL_ID, 'local-second']);
    expect(sources[0].originKey).not.toBe(sources[1].originKey);
  });
  it('uploads and verifies settings, roster, custom eligibility, moves and overrides without deleting the source', async () => {
    const { local } = localTeams(), client = sdk();
    const source = local.migrationSources(A)[0];
    const result = await adoptLocalWorkspace(client, A, local, source, current);
    expect(workspaceContent(result.state)).toBe(workspaceContent(source.state));
    expect(local.repo(PRIMARY_LOCAL_ID).load().state).toEqual(source.state);
    expect(local.migrationSources(A)).toEqual([]);
    expect((await listCloudWorkspaces(client))).toHaveLength(1);
  });
  it('repeated sign-in and lost browser markers never duplicate the durable origin', async () => {
    const { local, storage } = localTeams(), client = sdk();
    const source = local.migrationSources(A)[0];
    await adoptLocalWorkspace(client, A, local, source, current);
    storage.removeItem(migrationMarkerKey(A, source.originKey));
    expect(await discoverMigrations(client, A, local, await listCloudWorkspaces(client), current)).toEqual([]);
    await adoptLocalWorkspace(client, A, local, source, current);
    expect(await listCloudWorkspaces(client)).toHaveLength(1);
  });
  it('cloud wins over stale local data after adoption', async () => {
    const { local, storage } = localTeams(), client = sdk();
    const source = local.migrationSources(A)[0];
    const first = await adoptLocalWorkspace(client, A, local, source, current);
    const newer = { ...first.state, settings: { ...first.state.settings, weeklyAcquisitionLimit: 9 } };
    await first.remote.save(newer);
    storage.removeItem(migrationMarkerKey(A, source.originKey));
    const retried = await adoptLocalWorkspace(client, A, local, source, current);
    expect(retried.state.settings.weeklyAcquisitionLimit).toBe(9);
    expect(retried.remote.revision).toBe(2);
  });
  it('adds an unrelated team even with identical names without overwriting an existing cloud team', async () => {
    const client = sdk();
    const cloud = new CloudRepository(client, A, null, 'existing');
    await cloud.save(sample('different-player'));
    const before = await cloud.load();
    const { local } = localTeams();
    const found = await discoverMigrations(client, A, local, await listCloudWorkspaces(client), current);
    expect(found).toHaveLength(1);
    await adoptLocalWorkspace(client, A, local, found[0], current);
    expect(await listCloudWorkspaces(client)).toHaveLength(2);
    expect(await cloud.load()).toEqual(before);
  });
  it('recognizes a legacy identical workspace using full content rather than the team name', async () => {
    const client = sdk();
    const { local } = localTeams();
    const cloud = new CloudRepository(client, A, null, 'initial');
    await cloud.save(local.repo(PRIMARY_LOCAL_ID).load().state);
    expect(await discoverMigrations(client, A, local, await listCloudWorkspaces(client), current)).toEqual([]);
    expect(await listCloudWorkspaces(client)).toHaveLength(1);
  });
  it('preserves failed uploads for retry and keeps the owned source out of user B and signed-out teams', async () => {
    const { local, storage } = localTeams();
    const source = local.migrationSources(A)[0];
    await expect(adoptLocalWorkspace(sdk(() => A, { failSave: true }), A, local, source, current)).rejects.toThrow('offline');
    expect(local.repo(source.id).load().state).toEqual(source.state);
    expect(local.migrationSources(A)).toHaveLength(1);
    expect(local.migrationSources(B)).toEqual([]);
    expect(local.list()).toEqual([]);
    expect(local.activeId()).not.toBe(source.id);
    expect(storage.getItem(migrationMarkerKey(A, source.originKey))).toBeNull();
  });
  it('does not mark migration complete after a mismatched read-back, including retries', async () => {
    const { local, storage } = localTeams(), client = sdk(() => A, { corruptRead: true });
    const source = local.migrationSources(A)[0];
    await expect(adoptLocalWorkspace(client, A, local, source, current)).rejects.toThrow('did not match');
    await expect(adoptLocalWorkspace(client, A, local, source, current)).rejects.toThrow('did not match');
    expect(storage.getItem(migrationMarkerKey(A, source.originKey))).toBeNull();
    expect(local.repo(source.id).load().state.roster).toEqual(source.state.roster);
    expect(await listCloudWorkspaces(client)).toHaveLength(1);
  });
  it('recovers an upload whose successful response was lost', async () => {
    const { local } = localTeams(), client = sdk(() => A, { loseSaveReply: true });
    const result = await adoptLocalWorkspace(client, A, local, local.migrationSources(A)[0], current);
    expect(result.state.roster).toEqual(sample().roster);
    expect(await listCloudWorkspaces(client)).toHaveLength(1);
  });
  it('restores on a second device or after all local storage is cleared', async () => {
    const { local, storage } = localTeams(), client = sdk();
    const result = await adoptLocalWorkspace(client, A, local, local.migrationSources(A)[0], current);
    storage.data.clear();
    const otherDevice = new LocalWorkspaces(memory());
    expect(otherDevice.list()).toEqual([]);
    const list = await listCloudWorkspaces(client);
    const restored = await new CloudRepository(client, A, list[0].id).load();
    expect(workspaceContent(restored!)).toEqual(workspaceContent(result.state));
  });
  it('isolates origin lookup and workspace data with actual RLS', async () => {
    const { local } = localTeams(), a = sdk(), b = sdk(() => B);
    const source = local.migrationSources(A)[0];
    const result = await adoptLocalWorkspace(a, A, local, source, current);
    expect(await findWorkspaceByOrigin(b, source.originKey)).toBeNull();
    expect(await listCloudWorkspaces(b)).toEqual([]);
    expect(await new CloudRepository(b, B, result.remote.leagueId).load()).toBeNull();
    await expect(adoptLocalWorkspace(b, B, local, source, current)).rejects.toThrow('another account');
  });
  it('does not complete or expose an adoption when the session changes during upload', async () => {
    const { local, storage } = localTeams();
    let user = A;
    const client = sdk(() => user, { afterSave: () => { user = B; } });
    const source = local.migrationSources(A)[0];
    await expect(adoptLocalWorkspace(client, A, local, source, () => user === A)).rejects.toThrow('session changed');
    expect(storage.getItem(migrationMarkerKey(A, source.originKey))).toBeNull();
    expect(local.migrationSources(B)).toEqual([]);
  });
});

it('independent background reads cannot advance a writer revision or overwrite newer edits', async () => {
  const client = sdk();
  const writer = new CloudRepository(client, A, null, 'race');
  await writer.save(sample());
  const second = new CloudRepository(client, A, writer.leagueId);
  const original = await second.load();
  await second.save({ ...original!, settings: { ...original!.settings, teamName: 'Newer remote team' } });
  const refresh = new CloudRepository(client, A, writer.leagueId);
  expect((await refresh.load())?.settings.teamName).toBe('Newer remote team');
  expect(writer.revision).toBe(1);
  await expect(writer.save(sample())).rejects.toThrow('newer data');
  expect((await refresh.load())?.settings.teamName).toBe('Newer remote team');
});
it('a failed write can retry its unchanged revision without losing edits', async () => {
  const options = { failSave: false };
  const client = sdk(() => A, options);
  const remote = new CloudRepository(client, A, null, 'retry');
  await remote.save(sample());
  options.failSave = true;
  const changed = sample(); changed.settings.weeklyAcquisitionLimit = 9;
  await expect(remote.save(changed)).rejects.toThrow('offline');
  expect(remote.revision).toBe(1);
  options.failSave = false;
  await remote.save(changed);
  expect((await remote.load())?.settings.weeklyAcquisitionLimit).toBe(9);
});
