import type { WorkspaceSummary } from "./cloud/repository";
import { LocalStorageRepository, STORAGE_KEY, type StorageLike } from "./repository";

/**
 * Local (signed-out) team workspaces. The original single-team slot (`shift.streaming.v2`) IS the first
 * workspace, so existing data needs no migration; extra teams get their own slot, listed in a small index.
 */
export const WORKSPACE_INDEX_KEY = "shift.workspaces.v1";
export const PRIMARY_LOCAL_ID = "local-primary";

type LocalIndex = { version: 1; activeId: string; extra: string[] };

export function localWorkspaceKey(id: string): string {
  return id === PRIMARY_LOCAL_ID ? STORAGE_KEY : `${STORAGE_KEY}.ws.${id}`;
}

/** Signed-in users remember their last team per account (never shared between accounts on one browser). */
export function cloudActiveKey(userId: string): string {
  return `shift.activeWorkspace.${userId}`;
}

export function newWorkspaceId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-${random}`;
}

/** Pick the active team: the remembered one if it still exists, else the most recently updated, else the first. */
export function resolveActiveWorkspace(workspaces: readonly WorkspaceSummary[], remembered: string | null): string | null {
  if (!workspaces.length) return null;
  if (remembered && workspaces.some((w) => w.id === remembered)) return remembered;
  const byRecent = [...workspaces].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return byRecent[0].updatedAt ? byRecent[0].id : workspaces[0].id;
}

export class LocalWorkspaces {
  constructor(private readonly storage: StorageLike | null) {}

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string) {
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* storage blocked: stays in memory for this session */
    }
  }

  /** The index, repaired if missing or malformed: a bad active id falls back to the primary team. */
  index(): LocalIndex {
    let parsed: Partial<LocalIndex> | null = null;
    try {
      parsed = JSON.parse(this.read(WORKSPACE_INDEX_KEY) ?? "null");
    } catch {
      parsed = null;
    }
    const extra = Array.isArray(parsed?.extra) ? [...new Set(parsed.extra.filter((x): x is string => typeof x === "string" && x.startsWith("local-") && x !== PRIMARY_LOCAL_ID))] : [];
    const ids = [PRIMARY_LOCAL_ID, ...extra];
    const activeId = typeof parsed?.activeId === "string" && ids.includes(parsed.activeId) ? parsed.activeId : PRIMARY_LOCAL_ID;
    return { version: 1, activeId, extra };
  }

  private save(index: LocalIndex) {
    this.write(WORKSPACE_INDEX_KEY, JSON.stringify(index));
  }

  activeId(): string {
    return this.index().activeId;
  }

  setActive(id: string) {
    const index = this.index();
    if (id !== PRIMARY_LOCAL_ID && !index.extra.includes(id)) return;
    this.save({ ...index, activeId: id });
  }

  /** Register a new team slot (idempotent) and make it active. */
  add(id: string) {
    const index = this.index();
    this.save({ ...index, extra: index.extra.includes(id) ? index.extra : [...index.extra, id], activeId: id });
  }

  repo(id: string): LocalStorageRepository {
    return new LocalStorageRepository(this.storage, localWorkspaceKey(id));
  }

  /** Summaries for the Account menu, read from each slot's settings only. */
  list(): WorkspaceSummary[] {
    const index = this.index();
    const summaries: WorkspaceSummary[] = [];
    for (const id of [PRIMARY_LOCAL_ID, ...index.extra]) {
      let settings: { teamName?: unknown; leagueName?: unknown; season?: unknown } | undefined;
      let setup = false;
      try {
        const raw = JSON.parse(this.read(localWorkspaceKey(id)) ?? "null");
        settings = raw?.settings;
        setup = raw?.setupComplete === true;
      } catch {
        settings = undefined;
      }
      // The primary slot is only a team once set up (it is empty before first setup, or after moving to the cloud).
      if (id === PRIMARY_LOCAL_ID && !setup) continue;
      summaries.push({
        id,
        teamName: typeof settings?.teamName === "string" && settings.teamName.trim() ? settings.teamName : "Untitled team",
        leagueName: typeof settings?.leagueName === "string" && settings.leagueName.trim() ? settings.leagueName : "Untitled league",
        season: typeof settings?.season === "string" ? settings.season : "",
      });
    }
    return summaries;
  }
}
