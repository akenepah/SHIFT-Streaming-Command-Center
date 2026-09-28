"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { createInitialState, type AppState } from "./appState";
import { reducer, type Action } from "./reducer";
import { browserRepository, type AppStateRepository, type LoadResult } from "./repository";

type Store = {
  state: AppState;
  dispatch: (action: Action) => void;
  hydrated: boolean;
  loadStatus: LoadResult["status"] | null;
  /** Set when legacy sample players were removed on this load. */
  removedDemoPlayers: number;
};

const StoreContext = createContext<Store | null>(null);

/**
 * App-wide state. Loads from the repository after mount (localStorage is
 * browser-only) and saves every change afterwards.
 */
export function StoreProvider({ children, repository }: { children: ReactNode; repository?: AppStateRepository }) {
  const repo = useRef<AppStateRepository | null>(repository ?? null);
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadResult["status"] | null>(null);
  const [removedDemoPlayers, setRemovedDemoPlayers] = useState(0);

  const loaded = useRef(false);

  useEffect(() => {
    // Load exactly once: a second load (React StrictMode re-runs effects in
    // development) would see already-migrated data and lose the load status.
    if (loaded.current) return;
    loaded.current = true;
    repo.current ??= browserRepository();
    const result = repo.current.load();
    dispatch({ type: "hydrate", state: result.state });
    setLoadStatus(result.status);
    if (result.status === "migrated") setRemovedDemoPlayers(result.removedDemoPlayers);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) repo.current?.save(state);
  }, [state, hydrated]);

  const value = useMemo(
    () => ({ state, dispatch, hydrated, loadStatus, removedDemoPlayers }),
    [state, hydrated, loadStatus, removedDemoPlayers],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}
