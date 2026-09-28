"use client";

import { AlertTriangle, ArrowLeft, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { PlayerIdentity, TeamTag } from "@/components/player/PlayerBits";
import { PlayerForm } from "@/components/player/PlayerForm";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { CATALOG_META, searchPlayers, withCatalog } from "@/domain/players/catalog";
import { findRosterDuplicate } from "@/domain/roster/duplicates";
import {
  draftFromPlayer,
  draftFromRepair,
  emptyPlayerDraft,
  playerFromDraft,
  validatePlayerDraft,
  type PlayerDraft,
} from "@/domain/roster/playerDraft";
import type { Player, RosterStatus } from "@/domain/types";
import type { RepairEntry } from "@/state/appState";
import { newId } from "@/state/reducer";
import { STATUS_LABEL } from "@/state/selectors";
import { useStore } from "@/state/store";

const STATUSES: RosterStatus[] = ["ACTIVE", "BENCH", "IR_PLUS"];
const STATUS_HELP: Record<RosterStatus, string> = {
  ACTIVE: "First pick for open lineup slots.",
  BENCH: "Starts whenever a legal slot is still open.",
  IR_PLUS: "Never starts.",
};

function StatusSelect({ value, onChange, id }: { value: RosterStatus; onChange: (s: RosterStatus) => void; id: string }) {
  return (
    <Field id={id} label="Roster status" help={STATUS_HELP[value]}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as RosterStatus)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Saved players plus the bundled catalog, minus anyone already rostered. */
function usePlayerPool(excludeIds: ReadonlySet<string>): Player[] {
  const { state } = useStore();
  return useMemo(
    () => Object.values(withCatalog(state.players)).filter((p) => !excludeIds.has(p.id)),
    [state.players, excludeIds],
  );
}

/** Search result row: headshot, name, team and position, with an action. */
export function PlayerResultRow({ player, action }: { player: Player; action: ReactNode }) {
  return (
    <li className="flex items-center gap-4 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <PlayerIdentity
          name={player.name}
          headshot={player.headshot}
          secondary={player.custom ? `${player.eligiblePositions.join(", ")} · created by you` : player.eligiblePositions.join(", ")}
        />
      </span>
      <TeamTag teamId={player.nhlTeamId} />
      {action}
    </li>
  );
}

export function AddPlayerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RosterStatus>("BENCH");
  const [draft, setDraft] = useState<PlayerDraft>(emptyPlayerDraft);
  const [errors, setErrors] = useState<string[]>([]);
  /** Name the user was warned about; confirming the same name again adds anyway. */
  const [duplicateOf, setDuplicateOf] = useState<{ name: string; existing: Player; pending: () => void } | null>(null);

  const rostered = useMemo(() => new Set(state.roster.map((r) => r.playerId)), [state.roster]);
  const pool = usePlayerPool(rostered);
  const results = useMemo(() => searchPlayers(query, pool, 30), [query, pool]);
  const savedCustom = useMemo(
    () => pool.filter((p) => p.custom).sort((a, b) => a.name.localeCompare(b.name)),
    [pool],
  );

  const close = () => {
    setQuery("");
    setMode("search");
    setDraft(emptyPlayerDraft());
    setErrors([]);
    setDuplicateOf(null);
    onClose();
  };

  /** Run `add` unless it would duplicate a rostered name; then warn first. */
  const guardDuplicate = (name: string, add: () => void) => {
    const existing = findRosterDuplicate(name, state.roster, state.players);
    if (existing && duplicateOf?.name !== name) {
      setDuplicateOf({ name, existing, pending: add });
      return;
    }
    setDuplicateOf(null);
    add();
  };

  const addExisting = (p: Player) => {
    guardDuplicate(p.name, () => {
      // Catalog players become saved players when first added, so later edits stick.
      if (!state.players[p.id]) dispatch({ type: "player/upsert", player: p });
      dispatch({ type: "roster/add", playerId: p.id, status });
      toast(`${p.name} added to your roster.`);
    });
  };

  const create = () => {
    const errs = validatePlayerDraft(draft);
    setErrors(errs);
    if (errs.length) return;
    guardDuplicate(draft.name.trim(), () => {
      const player = playerFromDraft(draft, newId("player"), true);
      dispatch({ type: "player/upsert", player });
      dispatch({ type: "roster/add", playerId: player.id, status });
      toast(`${player.name} added to your roster.`);
      close();
    });
  };

  const addButton = (p: Player) => (
    <Button size="sm" variant="primary" onClick={() => addExisting(p)} aria-label={`Add ${p.name}`}>
      Add
    </Button>
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      title={mode === "search" ? "Add player" : "Create player manually"}
      description={
        mode === "search"
          ? `Search ${CATALOG_META.playerCount} NHL players. Team, position and headshot fill in automatically.`
          : "Only for players who aren't in the catalog. Their NHL team fills in their schedule."
      }
      width="md"
      footer={
        mode === "create" ? (
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setMode("search")}>
              <ArrowLeft aria-hidden /> Back to search
            </Button>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={create}>
              {duplicateOf ? "Add anyway" : "Add player"}
            </Button>
          </>
        ) : (
          <Button onClick={close}>Done</Button>
        )
      }
    >
      <div className="grid gap-5">
        {duplicateOf && (
          <div role="alert" className="rounded-card border border-warn-line bg-warn-soft px-4 py-3 text-body-sm text-warn-strong">
            <p className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>{duplicateOf.existing.name}</strong> ({duplicateOf.existing.nhlTeamId}) is already on your roster.
                {mode === "create" && " Add a second copy anyway, or change the name."}
              </span>
            </p>
            <div className="mt-3 flex gap-2 pl-6">
              <Button size="sm" onClick={() => setDuplicateOf(null)}>
                Don&apos;t add
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const pending = duplicateOf.pending;
                  setDuplicateOf(null);
                  pending();
                }}
              >
                Add anyway
              </Button>
            </div>
          </div>
        )}

        {mode === "search" ? (
          <div>
            <label htmlFor="add-search" className="sr-only">
              Search players
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input
                id="add-search"
                className="pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by player name or team code"
                autoComplete="off"
                data-autofocus
              />
            </div>
            {query.trim() ? (
              <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-card border border-line" aria-label="Search results">
                {results.length === 0 && (
                  <li className="px-4 py-4 text-body-sm text-ink-2">No players match &ldquo;{query.trim()}&rdquo;.</li>
                )}
                {results.map((p) => (
                  <PlayerResultRow key={p.id} player={p} action={addButton(p)} />
                ))}
              </ul>
            ) : savedCustom.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-overline uppercase text-ink-3">Players you created</p>
                <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-card border border-line">
                  {savedCustom.map((p) => (
                    <PlayerResultRow key={p.id} player={p} action={addButton(p)} />
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-body-sm text-ink-3">Start typing a name, like &ldquo;McDavid&rdquo;, or a team code like &ldquo;EDM&rdquo;.</p>
            )}
            <p className="mt-4 text-body-sm text-ink-2">
              Can&apos;t find them?{" "}
              <button type="button" className="font-semibold text-primary-strong hover:underline" onClick={() => setMode("create")}>
                Create player manually
              </button>
            </p>
          </div>
        ) : (
          <PlayerForm draft={draft} onChange={setDraft} errors={errors} />
        )}
        <div className="w-56">
          <StatusSelect id="add-status" value={status} onChange={setStatus} />
        </div>
      </div>
    </Dialog>
  );
}

/** Edit a rostered player's details and roster status, or drop them. */
export function ManagePlayerDialog({
  player,
  status,
  onClose,
  onDrop,
}: {
  player: Player | null;
  status: RosterStatus | null;
  onClose: () => void;
  onDrop?: (p: Player) => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<PlayerDraft>(() => (player ? draftFromPlayer(player) : emptyPlayerDraft()));
  const [nextStatus, setNextStatus] = useState<RosterStatus | null>(status);
  const [errors, setErrors] = useState<string[]>([]);

  const save = () => {
    if (!player) return;
    const errs = validatePlayerDraft(draft);
    setErrors(errs);
    if (errs.length) return;
    const updated = playerFromDraft(draft, player.id, !!player.custom);
    dispatch({ type: "player/upsert", player: player.nhlId ? { ...updated, nhlId: player.nhlId } : updated });
    if (nextStatus && nextStatus !== status) dispatch({ type: "roster/setStatus", playerId: player.id, status: nextStatus });
    toast(`${draft.name.trim()} updated.`);
    onClose();
  };

  return (
    <Dialog
      open={!!player}
      onClose={onClose}
      title={player ? `Manage ${player.name}` : "Manage player"}
      description="Changing the NHL team immediately changes this player's schedule in the planner."
      footer={
        <>
          {onDrop && player && (
            <Button variant="quiet-danger" className="mr-auto" onClick={() => onDrop(player)}>
              Drop player
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <PlayerForm draft={draft} onChange={setDraft} errors={errors} />
        {nextStatus && (
          <div className="w-56">
            <StatusSelect id="manage-status" value={nextStatus} onChange={setNextStatus} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function DropPlayerDialog({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  return (
    <Dialog
      open={!!player}
      onClose={onClose}
      width="sm"
      title={player ? `Drop ${player.name}?` : "Drop player"}
      description="This removes the player from your roster now. To plan a future drop, use Plan a move on the Weekly Planner."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (player) {
                dispatch({ type: "roster/drop", playerId: player.id });
                toast(`${player.name} dropped.`);
              }
              onClose();
            }}
          >
            Drop player
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-ink-2">They stay in your saved players, so you can add them back later.</p>
    </Dialog>
  );
}

/** Stored players that failed validation. The user can fix them (they rejoin the roster) or remove them. */
export function RepairPlayersPanel() {
  const { state, dispatch } = useStore();
  const [fixing, setFixing] = useState<RepairEntry | null>(null);
  if (state.needsRepair.length === 0) return null;
  return (
    <section aria-label="Players that need repair" className="rounded-panel border border-warn-line bg-warn-soft px-5 py-4 text-warn-strong">
      <h2 className="flex items-center gap-2 text-body font-semibold">
        <AlertTriangle aria-hidden className="size-4" />
        {state.needsRepair.length === 1 ? "1 saved player needs repair" : `${state.needsRepair.length} saved players need repair`}
      </h2>
      <p className="mt-1 text-body-sm">These records couldn&apos;t be loaded, so the planner is ignoring them until they&apos;re fixed.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {state.needsRepair.map((r) => (
          <li key={r.playerId} className="flex items-center gap-3 rounded-control border border-warn-line bg-surface px-3.5 py-2 text-ink">
            <span className="min-w-0 flex-1 text-body-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-ink-2"> · {r.problems.join(", ")}</span>
            </span>
            <Button size="sm" variant="primary" onClick={() => setFixing(r)}>
              Fix
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "repair/remove", playerId: r.playerId })}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <RepairPlayerDialog key={fixing?.playerId ?? "none"} entry={fixing} onClose={() => setFixing(null)} />
    </section>
  );
}

function RepairPlayerDialog({ entry, onClose }: { entry: RepairEntry | null; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<PlayerDraft>(() => (entry ? draftFromRepair(entry) : emptyPlayerDraft()));
  const [errors, setErrors] = useState<string[]>([]);
  const save = () => {
    if (!entry) return;
    const errs = validatePlayerDraft(draft);
    setErrors(errs);
    if (errs.length) return;
    dispatch({ type: "repair/resolve", player: playerFromDraft(draft, entry.playerId, true) });
    toast(`${draft.name.trim()} repaired.`);
    onClose();
  };
  return (
    <Dialog
      open={!!entry}
      onClose={onClose}
      title={entry ? `Fix ${entry.name}` : "Fix player"}
      description={entry ? `Problem: ${entry.problems.join(", ")}.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save player
          </Button>
        </>
      }
    >
      <PlayerForm draft={draft} onChange={setDraft} errors={errors} />
    </Dialog>
  );
}
