"use client";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createInitialState, type AppState } from "./appState";
import { reducer, type Action } from "./reducer";
import { browserStorage, STORAGE_KEY, type AppStateRepository, type LoadResult } from "./repository";
import { cloudClient } from "./cloud/client";
import { CloudRepository, INITIAL_ORIGIN, listCloudWorkspaces, shouldOfferMigration, type WorkspaceSummary } from "./cloud/repository";
import { cloudActiveKey, LocalWorkspaces, localWorkspaceKey, newWorkspaceId, PRIMARY_LOCAL_ID, resolveActiveWorkspace, WORKSPACE_INDEX_KEY } from "./workspaces";

/**
 * App state for the ACTIVE team workspace, plus the workspace layer around it.
 *
 * - `state` is always exactly one team (league settings, roster, moves, overrides); every screen reads it
 *   unchanged. Switching teams swaps it wholesale behind a loading state, so no screen ever shows one team's
 *   data under another team's name.
 * - Signed out: workspaces live in localStorage (the original `shift.streaming.v2` slot is the first team).
 * - Signed in: the cloud is authoritative; each workspace is a league + fantasy team, saved with a revision
 *   check (stale tabs get a conflict, never an overwrite).
 */
type Store = {
  state: AppState;
  dispatch: (action: Action) => void;
  hydrated: boolean;
  loadStatus: LoadResult["status"] | null;
  removedDemoPlayers: number;
  user: User | null;
  cloudStatus: string;
  cloudError: string | null;
  migration: boolean;
  resolveMigration: (save: boolean) => Promise<void>;
  reloadCloud: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Bumps when another tab's change is loaded into this one (dirty forms warn on it). */
  externalRevision: number;
  /** The signed-in user's teams (cloud) or this browser's teams (signed out). */
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  /** True while "Add another team" setup is in progress (nothing is saved until setup completes). */
  creatingWorkspace: boolean;
  switchWorkspace: (id: string) => Promise<void>;
  startNewWorkspace: () => Promise<void>;
  cancelNewWorkspace: () => Promise<void>;
};

type Draft = { previousId: string | null; originKey: string; localId: string };

const StoreContext = createContext<Store | null>(null);

function readPref(key: string): string | null {
  try {
    return browserStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    browserStorage()?.setItem(key, value);
  } catch {
    /* ignore: the active team just isn't remembered */
  }
}

export function StoreProvider({ children, repository }: { children: ReactNode; repository?: AppStateRepository }) {
  // `repository` (tests) = a single fixed workspace; otherwise local workspaces come from localStorage.
  const repo = useRef<AppStateRepository | null>(repository ?? null);
  const localWs = useRef<LocalWorkspaces | null>(null);
  const localActive = useRef<string>(PRIMARY_LOCAL_ID);
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadResult["status"] | null>(null);
  const [removedDemoPlayers, setRemovedDemoPlayers] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [cloudStatus, setCloudStatus] = useState("Local only");
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [migration, setMigration] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [externalRevision, setExternalRevision] = useState(0);

  const candidate = useRef<AppState | null>(null);
  const cloud = useRef<CloudRepository | null>(null);
  const lastSaved = useRef<AppState | null>(null);
  const latest = useRef(state);
  const blocked = useRef(false);
  const pending = useRef<AppState | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const owner = useRef<string | null>(null);
  const generation = useRef(0);
  const loaded = useRef(false);
  const activeId = useRef<string | null>(null);
  const draft = useRef<Draft | null>(null);
  const committing = useRef(false);
  // Set while hydrating state that is already stored (another tab, a team switch), so it isn't written straight back.
  const external = useRef(false);

  const setActive = (id: string | null) => {
    activeId.current = id;
    setActiveWorkspaceIdState(id);
    if (id && owner.current) writePref(cloudActiveKey(owner.current), id);
  };
  const refreshLocalList = () => {
    if (localWs.current) setWorkspaces(localWs.current.list());
  };
  /** Load the active local team into state (initial load, sign-out, switching). */
  const loadLocal = (id?: string) => {
    const ws = localWs.current;
    if (ws) {
      const target = id ?? ws.activeId();
      if (id) ws.setActive(id);
      localActive.current = target;
      repo.current = ws.repo(target);
    }
    const result = repo.current!.load();
    candidate.current = result.state;
    external.current = true;
    dispatch({ type: "hydrate", state: result.state });
    refreshLocalList();
    activeId.current = ws ? localActive.current : null;
    setActiveWorkspaceIdState(activeId.current);
    return result;
  };

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      if (!repo.current) localWs.current = new LocalWorkspaces(browserStorage());
      const result = loadLocal();
      setLoadStatus(result.status);
      // One-time sync from an external store (localStorage) on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (result.status === "migrated") setRemovedDemoPlayers(result.removedDemoPlayers);
    }
    const client = cloudClient();
    if (!client) {
      setHydrated(true);
      return;
    }
    let active = true;
    const sub = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      if (owner.current === next?.id && cloud.current) return;
      const previous = owner.current;
      owner.current = next?.id ?? null;
      setUser(next);
      setCloudError(null);
      cloud.current = null;
      pending.current = null;
      blocked.current = false;
      draft.current = null;
      setCreatingWorkspace(false);
      setMigration(false);
      const ticket = ++generation.current;
      if (!next) {
        // Signed out: back to this browser's own (local) teams. Cloud data never lives in localStorage, so
        // nothing of the previous account remains; its team list is dropped from memory.
        if (previous) loadLocal();
        setCloudStatus("Local only");
        setHydrated(true);
        return;
      }
      setHydrated(false);
      setWorkspaces([]);
      setActiveWorkspaceIdState(null);
      setCloudStatus("Loading saved data…");
      // Avoid waiting for another auth request inside the auth callback.
      setTimeout(async () => {
        try {
          const list = await listCloudWorkspaces(client);
          if (!active || generation.current !== ticket) return;
          const id = resolveActiveWorkspace(list, readPref(cloudActiveKey(next.id)));
          const remote = new CloudRepository(client, next.id, id, id ? null : INITIAL_ORIGIN);
          const saved = await remote.load();
          if (!active || generation.current !== ticket) return;
          cloud.current = remote;
          setWorkspaces(list);
          setActive(id);
          const local = candidate.current;
          const offer = !!local && shouldOfferMigration(local, list.length > 0);
          blocked.current = offer;
          setMigration(offer);
          const initial = saved ?? (offer ? local! : createInitialState());
          lastSaved.current = initial;
          dispatch({ type: "hydrate", state: initial });
          // Cloud wins over local data, but signed-out changes that differ are kept aside, never destroyed.
          const keptBackup = !!saved && !!local && shouldOfferMigration(local, false) && JSON.stringify(local) !== JSON.stringify(saved);
          if (keptBackup) repo.current?.backup?.(local!);
          setCloudStatus(offer ? "Choose whether to save existing setup" : keptBackup ? "Saved to account · earlier signed-out changes kept as a local backup" : "Saved to account");
          setHydrated(true);
          if (saved) {
            candidate.current = null;
            repo.current?.clear();
          }
        } catch (e) {
          if (active && generation.current === ticket) {
            blocked.current = true;
            setCloudError(e instanceof Error ? e.message : String(e));
            setCloudStatus("Cloud unavailable");
            setHydrated(true);
            dispatch({ type: "hydrate", state: createInitialState() });
          }
        }
      }, 0);
    });
    return () => {
      active = false;
      sub.data.subscription.unsubscribe();
    };
    // Runs once; callbacks read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function drain() {
    if (saving.current) return saving.current;
    const remote = cloud.current;
    if (!remote || blocked.current) return;
    saving.current = (async () => {
      try {
        while (pending.current && cloud.current === remote && !blocked.current) {
          const next = pending.current;
          pending.current = null;
          setCloudStatus("Saving…");
          const created = !remote.leagueId;
          await remote.save(next);
          if (cloud.current !== remote) return;
          lastSaved.current = next;
          setCloudStatus("Saved to account");
          // The account's first team was just created by this save: make it the active, listed workspace.
          if (created && remote.leagueId) {
            setActive(remote.leagueId);
            const client = cloudClient();
            if (client) setWorkspaces(await listCloudWorkspaces(client));
          }
        }
      } catch (e) {
        if (cloud.current === remote) {
          blocked.current = true;
          setCloudError(e instanceof Error ? e.message : "Could not save.");
          setCloudStatus("Changes not saved");
        }
      } finally {
        saving.current = null;
      }
    })();
    return saving.current;
  }

  /** "Add another team" finished setup: save it as a NEW workspace (never over the previous team) and switch to it. */
  async function commitNewWorkspace(next: AppState) {
    const d = draft.current;
    if (!d || committing.current) return;
    committing.current = true;
    try {
      const client = cloudClient();
      if (owner.current && client) {
        const remote = new CloudRepository(client, owner.current, null, d.originKey);
        setCloudStatus("Saving…");
        // Retry transient failures (the origin key makes a retried create idempotent), so a network blip
        // never strands a finished new team.
        for (let attempt = 0; ; attempt++) {
          try {
            await remote.save(next);
            break;
          } catch (e) {
            const duplicate = e instanceof Error && /already saved/.test(e.message);
            if (duplicate && attempt > 0) {
              // An earlier attempt DID create it (only its reply was lost): open that team, newest in the list.
              const list = await listCloudWorkspaces(client);
              draft.current = null;
              setCreatingWorkspace(false);
              setWorkspaces(list);
              activeId.current = null;
              await switchWorkspace(list[list.length - 1].id);
              return;
            }
            if (duplicate || attempt >= 3) throw e;
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
        }
        cloud.current = remote;
        lastSaved.current = next;
        draft.current = null;
        setCreatingWorkspace(false);
        setActive(remote.leagueId);
        setWorkspaces(await listCloudWorkspaces(client));
        setCloudStatus("Saved to account");
        // Anything changed while the create was in flight is saved normally now.
        if (latest.current !== next) {
          pending.current = latest.current;
          void drain();
        }
      } else if (localWs.current) {
        const ws = localWs.current;
        const r = ws.repo(d.localId);
        r.save(latest.current);
        ws.add(d.localId);
        repo.current = r;
        localActive.current = d.localId;
        candidate.current = latest.current;
        draft.current = null;
        setCreatingWorkspace(false);
        setActive(d.localId);
        refreshLocalList();
      }
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Could not save the new team.");
      setCloudStatus("Changes not saved");
    } finally {
      committing.current = false;
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    // New team in progress: nothing is persisted until its setup completes (cancel leaves no garbage).
    if (draft.current) {
      external.current = false;
      // Persisting a finished new team is a side effect of state reaching "setup complete".
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (state.setupComplete) void commitNewWorkspace(state);
      return;
    }
    if (external.current) {
      external.current = false;
      if (!user) candidate.current = state;
      else lastSaved.current = state;
      return;
    }
    if (!user) {
      repo.current?.save(state);
      candidate.current = state;
      refreshLocalList(); // names or "set up" status may have changed
      return;
    }
    if (!cloud.current || blocked.current || state === lastSaved.current) return;
    pending.current = state;
    void drain();
    // Writes are serialized by repository revision; callbacks read only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated, user]);

  // Keep the Account menu's names current as the active team's league/team names change.
  useEffect(() => {
    if (!hydrated || draft.current || !activeId.current || !user) return;
    const { teamName, leagueName, season } = state.settings;
    setWorkspaces((list) =>
      list.map((w) => (w.id === activeId.current && (w.teamName !== teamName || w.leagueName !== leagueName) ? { ...w, teamName, leagueName, season } : w)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.teamName, state.settings.leagueName, hydrated, user]);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (pending.current || saving.current || (blocked.current && owner.current)) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  // Multi-tab: never overwrite another tab's newer state with this tab's stale copy. Each tab keeps its own
  // active team. Local mode follows storage events for the team it shows; cloud mode refetches on focus.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (owner.current || draft.current || !repo.current) return;
      if (e.key === WORKSPACE_INDEX_KEY) {
        refreshLocalList();
        return;
      }
      // Only the slot this tab is showing matters; other teams' changes just refresh the list above.
      if (e.key !== (localWs.current ? localWorkspaceKey(localActive.current) : STORAGE_KEY)) return;
      const result = repo.current.load();
      external.current = true;
      candidate.current = result.state;
      dispatch({ type: "hydrate", state: result.state });
      setExternalRevision((n) => n + 1);
      refreshLocalList();
    };
    const onFocus = () => {
      const remote = cloud.current;
      if (document.visibilityState !== "visible" || !remote || draft.current || pending.current || saving.current || blocked.current) return;
      const before = remote.revision;
      remote
        .load()
        .then((saved) => {
          if (cloud.current !== remote || draft.current || pending.current || saving.current || !saved || remote.revision === before) return;
          external.current = true;
          lastSaved.current = saved;
          dispatch({ type: "hydrate", state: saved });
          setExternalRevision((n) => n + 1);
        })
        .catch(() => {
          /* A failed background refresh leaves current data untouched. */
        });
      const client = cloudClient();
      if (client && owner.current)
        listCloudWorkspaces(client)
          .then((list) => {
            if (cloud.current === remote) setWorkspaces(list);
          })
          .catch(() => {});
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  async function switchWorkspace(id: string) {
    if (id === activeId.current && !draft.current) return;
    const client = cloudClient();
    if (owner.current && client) {
      await drain();
      if (blocked.current) throw new Error("Resolve unsaved changes before switching teams.");
      draft.current = null;
      setCreatingWorkspace(false);
      const ticket = ++generation.current;
      setHydrated(false); // loading state: never show the old roster under the new team
      try {
        const remote = new CloudRepository(client, owner.current, id);
        const saved = await remote.load();
        if (generation.current !== ticket) return;
        if (!saved) {
          setWorkspaces(await listCloudWorkspaces(client));
          throw new Error("That team is no longer in your account.");
        }
        cloud.current = remote;
        pending.current = null;
        lastSaved.current = saved;
        dispatch({ type: "hydrate", state: saved });
        setActive(id);
      } finally {
        if (generation.current === ticket) setHydrated(true);
      }
      return;
    }
    if (!localWs.current) return;
    draft.current = null;
    setCreatingWorkspace(false);
    loadLocal(id);
  }

  async function startNewWorkspace() {
    await drain();
    if (owner.current && blocked.current) throw new Error("Resolve unsaved changes before adding a team.");
    draft.current = { previousId: activeId.current, originKey: newWorkspaceId(), localId: newWorkspaceId() };
    setCreatingWorkspace(true);
    dispatch({ type: "hydrate", state: createInitialState() });
  }

  async function cancelNewWorkspace() {
    const d = draft.current;
    if (!d) return;
    draft.current = null;
    setCreatingWorkspace(false);
    if (d.previousId) {
      activeId.current = null; // force the reload
      await switchWorkspace(d.previousId);
    } else if (!owner.current) {
      loadLocal();
    } else {
      external.current = true;
      dispatch({ type: "hydrate", state: lastSaved.current ?? createInitialState() });
    }
  }

  async function resolveMigration(save: boolean) {
    const remote = cloud.current;
    if (!remote) return;
    try {
      setCloudError(null);
      setCloudStatus("Saving…");
      const initial = save ? latest.current : createInitialState();
      await remote.save(initial); // the "initial" origin key makes repeated/concurrent migration safe.
      if (cloud.current !== remote) return;
      blocked.current = false;
      setMigration(false);
      lastSaved.current = initial;
      // "Start fresh" keeps the local setup aside instead of destroying it.
      if (!save && candidate.current) repo.current?.backup?.(candidate.current);
      candidate.current = null;
      repo.current?.clear();
      dispatch({ type: "hydrate", state: initial });
      setActive(remote.leagueId);
      const client = cloudClient();
      if (client) setWorkspaces(await listCloudWorkspaces(client));
      setCloudStatus("Saved to account");
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Migration failed.");
      setCloudStatus("Changes not saved");
    }
  }

  async function reloadCloud() {
    const client = cloudClient();
    const uid = owner.current;
    if (!client || !uid) return;
    try {
      await saving.current;
      const list = await listCloudWorkspaces(client);
      const id = resolveActiveWorkspace(list, activeId.current ?? readPref(cloudActiveKey(uid)));
      const remote = new CloudRepository(client, uid, id, id ? null : INITIAL_ORIGIN);
      const saved = await remote.load();
      cloud.current = remote;
      pending.current = null;
      blocked.current = false;
      draft.current = null;
      setCreatingWorkspace(false);
      setMigration(false);
      setCloudError(null);
      const next = saved ?? createInitialState();
      lastSaved.current = next;
      dispatch({ type: "hydrate", state: next });
      setWorkspaces(list);
      setActive(id);
      setCloudStatus("Saved to account");
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : "Could not load saved data.");
    }
  }

  async function signOut() {
    await drain();
    if (blocked.current && !migration) throw new Error("Resolve unsaved changes before signing out.");
    const { error } = await cloudClient()!.auth.signOut();
    if (error) throw error;
  }

  const value = useMemo(
    () => ({
      state, dispatch, hydrated, loadStatus, removedDemoPlayers, user, cloudStatus, cloudError, migration,
      resolveMigration, reloadCloud, signOut, externalRevision,
      workspaces, activeWorkspaceId, creatingWorkspace, switchWorkspace, startNewWorkspace, cancelNewWorkspace,
    }),
    // Functions use current state and refs; recreate the public value as state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, hydrated, loadStatus, removedDemoPlayers, user, cloudStatus, cloudError, migration, externalRevision, workspaces, activeWorkspaceId, creatingWorkspace],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("StoreProvider required");
  return value;
}
