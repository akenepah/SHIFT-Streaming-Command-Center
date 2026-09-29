import { createInitialState, type AppState } from "./appState";
import { migrateV1, parseAppState } from "./parse";

export const STORAGE_KEY = "shift.streaming.v2";
/** Key used by the first alpha build (schema v1, sample roster). Read once, migrated, then removed. */
export const LEGACY_STORAGE_KEY = "shift.streaming.v1";
export const LEGACY_BACKUP_KEY = "shift.streaming.v1.migrated-backup";
/** Signed-out local data set aside when the account's (newer) cloud data wins. */
export const SIGNED_OUT_BACKUP_KEY = "shift.streaming.v2.signed-out-backup";

export type LoadResult =
  | { status: "loaded"; state: AppState }
  | { status: "empty"; state: AppState }
  | { status: "migrated"; state: AppState; removedDemoPlayers: number; keptPlayers: number }
  | { status: "corrupt"; state: AppState };

/** Persistence boundary. Only this module touches browser storage. */
export interface AppStateRepository {
  load(): LoadResult;
  save(state: AppState): void;
  clear(): void;
  /** Keep a copy aside (never loaded automatically), e.g. signed-out changes when the account's cloud data wins. */
  backup?(state: AppState): void;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalStorageRepository implements AppStateRepository {
  /** `key`: which workspace slot this repository reads and writes (default: the primary team). */
  constructor(
    private readonly storage: StorageLike | null,
    readonly key: string = STORAGE_KEY,
  ) {}

  private get(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private set(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* storage full or blocked: the app keeps working in memory */
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  load(): LoadResult {
    const raw = this.get(this.key);
    if (raw !== null) {
      const parsed = safeParse(raw, parseAppState);
      if (parsed) return { status: "loaded", state: parsed };
      // Keep the unreadable payload aside instead of silently destroying it.
      this.set(`${this.key}.corrupt`, raw);
      return { status: "corrupt", state: createInitialState() };
    }

    // The v1 alpha only ever had one team: it can only migrate into the primary slot.
    const legacy = this.key === STORAGE_KEY ? this.get(LEGACY_STORAGE_KEY) : null;
    if (legacy === null) return { status: "empty", state: createInitialState() };

    // One-time migration from the v1 alpha. The original payload is kept as a
    // backup and the legacy key removed, so the sample roster can't come back.
    this.set(LEGACY_BACKUP_KEY, legacy);
    this.remove(LEGACY_STORAGE_KEY);
    const migrated = safeParse(legacy, migrateV1);
    if (!migrated) return { status: "corrupt", state: createInitialState() };
    this.save(migrated.state);
    return { status: "migrated", ...migrated };
  }

  save(state: AppState): void {
    this.set(this.key, JSON.stringify(state));
  }

  clear(): void {
    this.remove(this.key);
  }

  backup(state: AppState): void {
    this.set(SIGNED_OUT_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), state }));
  }
}

function safeParse<T>(raw: string, f: (json: unknown) => T | null): T | null {
  try {
    return f(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** window.localStorage when available (null on the server, in blocked-storage browsers, or when access throws). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function browserRepository(): AppStateRepository {
  return new LocalStorageRepository(browserStorage());
}
