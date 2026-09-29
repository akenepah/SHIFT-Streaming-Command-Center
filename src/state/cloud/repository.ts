import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState } from '../appState';
import { parseAppState } from '../parse';

/** Versioned transaction envelope, not a database blob. SQL stores normalized rows. */
export function migrationPayload(state: AppState) {
  if (state.needsRepair.length) throw new Error('Repair saved players before saving this setup to your account.');
  return {
    settings: state.settings, setupComplete: state.setupComplete,
    players: Object.values(state.players),
    roster: state.roster.map((r, ordinal) => ({ ...r, ordinal })),
    transactions: state.transactions, overrides: state.overrides.map((o, ordinal) => ({...o, ordinal})),
  };
}
export function shouldOfferMigration(local: AppState, cloudExists: boolean) {
  return !cloudExists && (local.setupComplete || local.roster.length > 0 || Object.keys(local.players).length > 0);
}
/** Transient connectivity failure (safe to retry). */
export class NetworkError extends Error {}

/** One team workspace in the Account menu. Cloud ids are league ids; local ids are storage slots. */
export type WorkspaceSummary = { id: string; teamName: string; leagueName: string; season: string; updatedAt?: string };

/** Origin key for the account's first workspace (initial setup or local → cloud migration): creating it twice is refused. */
export const INITIAL_ORIGIN = 'initial';

function friendly(message: string): string {
  if (message.includes('SHIFT_CONFLICT')) return 'Another tab saved newer data. Reload saved data before making more changes.';
  if (message.includes('SHIFT_DUPLICATE')) return 'This team was already saved (another tab or a retry). Reload saved data.';
  if (message.includes('SHIFT_NOT_FOUND')) return 'This team is no longer in your account. Reload saved data.';
  return message;
}

/** Lightweight summaries of the signed-in user's teams (RLS limits them to the owner). */
export async function listCloudWorkspaces(client: SupabaseClient): Promise<WorkspaceSummary[]> {
  const { data, error } = await client.rpc('list_shift_workspaces');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; teamName: string; leagueName: string; season: string; updatedAt?: string }[]).map((w) => ({
    id: w.id, teamName: w.teamName || 'Untitled team', leagueName: w.leagueName || 'Untitled league', season: w.season, updatedAt: w.updatedAt,
  }));
}

/**
 * One cloud workspace (league + its fantasy team). `leagueId` null means "not created yet": the first save
 * creates it, idempotently per `originKey`, and records the new id.
 */
export class CloudRepository {
  revision = 0;
  constructor(
    private readonly client: SupabaseClient,
    readonly ownerId: string,
    public leagueId: string | null = null,
    private readonly originKey: string | null = null,
  ) {}
  private async checkOwner() {
    const { data, error } = await this.client.auth.getUser();
    // A dropped connection is not a changed session: say so, and let callers retry.
    if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network/i.test(error.message)))
      throw new NetworkError("Couldn't reach SHIFT's servers. Check your connection and try again.");
    if (error || data.user?.id !== this.ownerId) throw new Error('Your session changed. Sign in again.');
  }
  async load(): Promise<AppState | null> {
    if (!this.leagueId) { this.revision = 0; return null; }
    await this.checkOwner();
    const { data, error } = await this.client.rpc('load_shift_workspace', { p_league_id: this.leagueId });
    if (error) throw new Error(friendly(error.message));
    if (!data) { this.revision = 0; return null; }
    const parsed = parseAppState(data.state);
    if (!parsed || parsed.needsRepair.length) throw new Error('Cloud data could not be read safely. Your saved data has not been overwritten.');
    this.revision = data.revision;
    return parsed;
  }
  async save(state: AppState) {
    await this.checkOwner();
    const { data, error } = await this.client.rpc('save_shift_workspace', {
      p_league_id: this.leagueId, payload: migrationPayload(state), expected_revision: this.revision,
      p_origin_key: this.leagueId ? null : this.originKey,
    });
    if (error) throw new Error(friendly(error.message));
    const result = data as { leagueId: string; revision: number };
    this.leagueId = result.leagueId;
    this.revision = Number(result.revision);
  }
}
