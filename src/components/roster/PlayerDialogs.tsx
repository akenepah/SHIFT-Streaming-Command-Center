"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { PlayerForm } from "@/components/player/PlayerForm";
import { PlayerSearch } from "@/components/player/PlayerSearch";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { withCatalog } from "@/domain/players/playerCatalog";
import { findExistingIdentity, isRostered, type ExistingIdentity } from "@/domain/players/searchPlayers";
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

/** Everything searchable: the bundled catalog plus the user's saved players. */
export function usePlayerPool(): { pool: Player[]; lookup: Record<string, Player> } {
  const { state } = useStore();
  return useMemo(() => {
    const lookup = withCatalog(state.players);
    return { pool: Object.values(lookup), lookup };
  }, [state.players]);
}

/**
 * Shown when a manually entered player already exists: a catalog player is
 * offered instead (preferred), or an existing custom player is reused.
 */
export function ExistingIdentityNotice({
  existing,
  onUse,
  onDismiss,
}: {
  existing: NonNullable<ExistingIdentity>;
  onUse: (p: Player) => void;
  onDismiss?: () => void;
}) {
  const p = existing.player;
  return (
    <div role="alert" className="rounded-card border border-primary-line bg-primary-soft px-4 py-3 text-body-sm text-ink">
      <p>
        {existing.kind === "catalog" ? (
          <>
            <strong>{p.name}</strong> ({p.nhlTeamId} · {p.eligiblePositions.join(", ")}) is already in the SHIFT Player
            Catalog. Use that player instead of creating a copy.
          </>
        ) : (
          <>
            You already created <strong>{p.name}</strong> ({p.nhlTeamId}). Use that player instead of creating another.
          </>
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" onClick={() => onUse(p)}>
          Use {p.name}
        </Button>
        {onDismiss && (
          <Button size="sm" onClick={onDismiss}>
            Keep editing
          </Button>
        )}
      </div>
    </div>
  );
}

/** Add a player to the actual roster (Roster screen and setup). */
export function AddPlayerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RosterStatus>("BENCH");
  const [draft, setDraft] = useState<PlayerDraft>(emptyPlayerDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [existing, setExisting] = useState<ExistingIdentity>(null);
  const [rosteredNotice, setRosteredNotice] = useState<string | null>(null);
  const { pool } = usePlayerPool();

  const rostered = (p: Player) => isRostered(p, state.roster, state.players);
  const savedIdle = useMemo(
    () =>
      Object.values(state.players)
        .filter((p) => !state.roster.some((r) => r.playerId === p.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.players, state.roster],
  );

  const close = () => {
    setQuery("");
    setMode("search");
    setDraft(emptyPlayerDraft());
    setErrors([]);
    setExisting(null);
    setRosteredNotice(null);
    onClose();
  };

  const addPlayer = (p: Player) => {
    if (rostered(p)) {
      setRosteredNotice(`${p.name} is already on your roster.`);
      return;
    }
    // Catalog players become saved players when first added, so later edits (e.g. eligibility) stick.
    if (!state.players[p.id]) dispatch({ type: "player/upsert", player: p });
    dispatch({ type: "roster/add", playerId: p.id, status });
    setRosteredNotice(null);
    toast(`${p.name} added to your roster.`);
  };

  const create = () => {
    const errs = validatePlayerDraft(draft);
    setErrors(errs);
    if (errs.length) return;
    const found = findExistingIdentity(draft.name, draft.nhlTeamId, pool);
    if (found) {
      setExisting(found);
      return;
    }
    const player = playerFromDraft(draft, newId("player"));
    dispatch({ type: "player/upsert", player });
    dispatch({ type: "roster/add", playerId: player.id, status });
    toast(`${player.name} added to your roster.`);
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={mode === "search" ? "Add player" : "Create player manually"}
      description={
        mode === "search"
          ? "Team, position and headshot fill in automatically."
          : "For players who aren't in the SHIFT Player Catalog. Their NHL team fills in their schedule."
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
              Add player
            </Button>
          </>
        ) : (
          <Button onClick={close}>Done</Button>
        )
      }
    >
      <div className="grid gap-5">
        {rosteredNotice && (
          <p role="status" className="rounded-control border border-line bg-surface-muted px-3.5 py-2.5 text-body-sm text-ink-2">
            {rosteredNotice}
          </p>
        )}
        {mode === "search" ? (
          <PlayerSearch
            inputId="add-search"
            query={query}
            onQueryChange={setQuery}
            pool={pool}
            isRostered={rostered}
            mode={{ kind: "action", actionLabel: "Add", onPick: addPlayer }}
            onCreateManually={() => {
              setDraft({ ...emptyPlayerDraft(), name: query.trim() });
              setMode("create");
            }}
            idle={{ label: "Your saved players", players: savedIdle }}
            autoFocus
          />
        ) : (
          <>
            {existing && (
              <ExistingIdentityNotice
                existing={existing}
                onUse={(p) => {
                  addPlayer(p);
                  close();
                }}
                onDismiss={() => setExisting(null)}
              />
            )}
            <PlayerForm draft={draft} onChange={setDraft} errors={errors} />
          </>
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
    // Keeps the player's identity (source, NHL id); only user-owned data changes.
    dispatch({ type: "player/upsert", player: playerFromDraft(draft, player.id, player) });
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
    dispatch({ type: "repair/resolve", player: playerFromDraft(draft, entry.playerId) });
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
