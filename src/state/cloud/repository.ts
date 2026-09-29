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
export class CloudRepository {
  revision = 0;
  constructor(private readonly client: SupabaseClient, readonly ownerId: string) {}
  private async checkOwner() {
    const { data, error } = await this.client.auth.getUser();
    if (error || data.user?.id !== this.ownerId) throw new Error('Your session changed. Sign in again.');
  }
  async load(): Promise<AppState | null> {
    await this.checkOwner();
    const { data, error } = await this.client.rpc('load_shift_state');
    if (error) throw new Error(error.message);
    if (!data) { this.revision = 0; return null; }
    const parsed = parseAppState(data.state);
    if (!parsed || parsed.needsRepair.length) throw new Error('Cloud data could not be read safely. Your saved data has not been overwritten.');
    this.revision = data.revision;
    return parsed;
  }
  async save(state: AppState) {
    await this.checkOwner();
    const { data, error } = await this.client.rpc('save_shift_state', { payload: migrationPayload(state), expected_revision: this.revision });
    if (error) {
      if (error.message.includes('SHIFT_CONFLICT')) throw new Error('Another tab saved newer data. Reload saved data before making more changes.');
      throw new Error(error.message);
    }
    this.revision = Number(data);
  }
}
