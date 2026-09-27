import type { AppState } from "./appState";
import { parseAppState } from "./parse";
import { createSeedState } from "./seed";

export const STORAGE_KEY = "shift.streaming.v1";

export type LoadResult =
  | { status: "loaded"; state: AppState }
  | { status: "empty"; state: AppState }
  | { status: "corrupt"; state: AppState };

/** Persistence boundary. Only this module touches browser storage. */
export interface AppStateRepository {
  load(): LoadResult;
  save(state: AppState): void;
  clear(): void;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalStorageRepository implements AppStateRepository {
  constructor(
    private readonly storage: StorageLike | null,
    private readonly key = STORAGE_KEY,
  ) {}

  load(): LoadResult {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(this.key) ?? null;
    } catch {
      return { status: "empty", state: createSeedState() };
    }
    if (raw === null) return { status: "empty", state: createSeedState() };

    let parsed: AppState | null = null;
    try {
      parsed = parseAppState(JSON.parse(raw));
    } catch {
      parsed = null;
    }
    if (parsed) return { status: "loaded", state: parsed };

    // Keep the unreadable payload aside instead of silently destroying it.
    try {
      this.storage?.setItem(`${this.key}.corrupt`, raw);
    } catch {
      /* storage full or blocked: nothing more to do */
    }
    return { status: "corrupt", state: createSeedState() };
  }

  save(state: AppState): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the app keeps working in memory */
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

export function browserRepository(): AppStateRepository {
  let storage: StorageLike | null = null;
  try {
    storage = typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    storage = null;
  }
  return new LocalStorageRepository(storage);
}
