import { resetDay, removeOverride, setOverride } from "@/domain/lineup/overrides";
import { cancelTransaction, createTransaction, updateTransaction, type TransactionDraft } from "@/domain/transactions/transactions";
import type { DailyLineupOverride, LeagueSettings, Player, RosterStatus } from "@/domain/types";
import type { AppState } from "./appState";
import { createEmptyState, createSeedState } from "./seed";

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "settings/update"; settings: LeagueSettings }
  | { type: "setup/complete" }
  | { type: "player/upsert"; player: Player }
  | { type: "roster/add"; playerId: string; status?: RosterStatus }
  | { type: "roster/drop"; playerId: string }
  | { type: "roster/setStatus"; playerId: string; status: RosterStatus }
  | { type: "roster/clear" }
  | { type: "tx/create"; id: string; draft: TransactionDraft; now?: string }
  | { type: "tx/update"; id: string; draft: TransactionDraft }
  | { type: "tx/cancel"; id: string }
  | { type: "override/set"; override: DailyLineupOverride }
  | { type: "override/remove"; date: string; playerId: string }
  | { type: "override/resetDay"; date: string }
  | { type: "data/reset"; mode: "sample" | "empty" };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "settings/update":
      return { ...state, settings: action.settings };
    case "setup/complete":
      return { ...state, setupComplete: true };
    case "player/upsert":
      return { ...state, players: { ...state.players, [action.player.id]: action.player } };
    case "roster/add":
      if (!state.players[action.playerId] || state.roster.some((r) => r.playerId === action.playerId)) return state;
      return { ...state, roster: [...state.roster, { playerId: action.playerId, rosterStatus: action.status ?? "BENCH" }] };
    case "roster/drop":
      return {
        ...state,
        roster: state.roster.filter((r) => r.playerId !== action.playerId),
        overrides: state.overrides.filter((o) => o.playerId !== action.playerId),
      };
    case "roster/setStatus":
      return {
        ...state,
        roster: state.roster.map((r) => (r.playerId === action.playerId ? { ...r, rosterStatus: action.status } : r)),
      };
    case "roster/clear":
      return { ...state, roster: [], transactions: [], overrides: [] };
    case "tx/create":
      return {
        ...state,
        transactions: [
          ...state.transactions,
          createTransaction(action.draft, action.id, action.now ? new Date(action.now) : new Date()),
        ],
      };
    case "tx/update":
      return { ...state, transactions: updateTransaction(state.transactions, action.id, action.draft) };
    case "tx/cancel":
      return { ...state, transactions: cancelTransaction(state.transactions, action.id) };
    case "override/set":
      return { ...state, overrides: setOverride(state.overrides, action.override) };
    case "override/remove":
      return { ...state, overrides: removeOverride(state.overrides, action.date, action.playerId) };
    case "override/resetDay":
      return { ...state, overrides: resetDay(state.overrides, action.date) };
    case "data/reset":
      return action.mode === "sample" ? createSeedState() : createEmptyState();
  }
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}
