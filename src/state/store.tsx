"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { AppState } from "./appState";
import { reducer, type Action } from "./reducer";
import { browserRepository, type AppStateRepository, type LoadResult } from "./repository";
import { createSeedState } from "./seed";

type Store = {
  state: AppState;
  dispatch: (action: Action) => void;
  hydrated: boolean;
  loadStatus: LoadResult["status"] | null;
};

const StoreContext = createContext<Store | null>(null);

/**
 * App-wide state. Loads from the repository after mount (localStorage is
 * browser-only) and saves every change afterwards.
 */
export function StoreProvider({ children, repository }: { children: ReactNode; repository?: AppStateRepository }) {
  const repo = useRef<AppStateRepository | null>(repository ?? null);
  const [state, dispatch] = useReducer(reducer, undefined, createSeedState);
  const [hydrated, setHydrated] = useState(false);
  const [loadStatus, setLoadStatus] = useState<LoadResult["status"] | null>(null);

  useEffect(() => {
    repo.current ??= browserRepository();
    const result = repo.current.load();
    dispatch({ type: "hydrate", state: result.state });
    setLoadStatus(result.status);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) repo.current?.save(state);
  }, [state, hydrated]);

  const value = useMemo(() => ({ state, dispatch, hydrated, loadStatus }), [state, hydrated, loadStatus]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}
